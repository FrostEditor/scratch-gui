// 多人协作管理器
// 支持 Cloudflare Workers + Durable Objects 模式
// 也兼容 Node.js 服务器模式

import AddonHooks from '../../addons/hooks.js';

class CollaborationManager {
    constructor() {
        this.ws = null;
        this.roomKey = null;
        this.isHost = false;
        this.members = [];
        this.username = '用户';
        this.vm = null;
        this.listeners = {};
        this.isConnected = false;
        this.projectUpdateTimeout = null;
        this.lastProjectData = null;
        this.isLoadingProject = false;
        this.memberId = null;
        this.serverUrl = null; // 服务器基础 URL
        this.serverType = 'workers'; // 'workers' 或 'node'
        
        // 鼠标同步
        this.mousePositions = {}; // memberId -> { x, y, color }
        this.mouseUpdateTimeout = null;
        this.lastMousePosition = null;
        this.mouseThrottleTime = 30; // 鼠标位置更新节流时间（ms），更流畅
        this.memberColors = {}; // memberId -> 颜色
        this.colorPalette = [
            '#FF6B6B', // 红
            '#4ECDC4', // 青
            '#FFE66D', // 黄
            '#95E1D3', // 浅绿
            '#F38181', // 粉
            '#AA96DA', // 紫
            '#FCBAD3', // 浅粉
            '#A8D8EA', // 浅蓝
        ];
        
        // 增量同步（Blockly 事件）
        this.isIncrementalSyncActive = false; // 增量同步是否激活
        this.isApplyingRemoteEvent = false; // 是否正在应用远程事件（避免循环发送）
        this._blocklyChangeListener = null; // Blockly 变化监听器
        this.moveEventTimeout = null; // MOVE 事件防抖定时器
        this.lastMoveEvent = null; // 最后一个 MOVE 事件
        this.hasResourceChange = false; // 是否有资源变化（图片、声音等），需要发送完整项目
    }

    // 设置 VM
    setVM(vm) {
        this.vm = vm;
        this.setupVMListeners();
        
        // 尝试恢复上次的房间连接（刷新后自动重连）
        // 延迟一下，确保页面加载完成
        setTimeout(() => {
            this.restoreLastRoom();
        }, 1000);
    }

    // 设置用户名
    setUsername(username) {
        this.username = username || '用户';
    }

    // 设置服务器地址
    setServer(url, type = 'workers') {
        this.serverUrl = url.replace(/\/$/, ''); // 去掉末尾的斜杠
        this.serverType = type;
    }

    // 生成成员 ID
    generateMemberId() {
        return 'member_' + Math.random().toString(36).substr(2, 9);
    }
    
    // 保存房间信息到 localStorage（刷新后自动重连用）
    saveRoomInfo() {
        try {
            const roomInfo = {
                roomKey: this.roomKey,
                serverUrl: this.serverUrl,
                serverType: this.serverType,
                username: this.username
            };
            localStorage.setItem('collaborationRoomInfo', JSON.stringify(roomInfo));
        } catch (e) {
            console.warn('[协作] 保存房间信息失败:', e);
        }
    }
    
    // 从 localStorage 清除房间信息
    clearRoomInfo() {
        try {
            localStorage.removeItem('collaborationRoomInfo');
        } catch (e) {
            console.warn('[协作] 清除房间信息失败:', e);
        }
    }
    
    // 恢复上次的房间连接（刷新后自动重连）
    async restoreLastRoom() {
        try {
            const saved = localStorage.getItem('collaborationRoomInfo');
            if (!saved) return false;
            
            const roomInfo = JSON.parse(saved);
            if (!roomInfo.roomKey || !roomInfo.serverUrl) return false;
            
            console.log('[协作] 检测到上次的房间，正在重新连接...');
            
            // 设置服务器
            this.setServer(roomInfo.serverUrl, roomInfo.serverType || 'workers');
            
            // 设置用户名
            if (roomInfo.username) {
                this.setUsername(roomInfo.username);
            }
            
            // 加入房间
            await this.joinRoom(roomInfo.roomKey);
            
            return true;
        } catch (e) {
            console.warn('[协作] 恢复房间连接失败:', e);
            this.clearRoomInfo();
            return false;
        }
    }

    // ========== Workers 模式 ==========

    // 创建房间（Workers 模式）
    async createRoom(serverUrl = null) {
        if (serverUrl) {
            this.setServer(serverUrl, 'workers');
        }

        if (!this.serverUrl) {
            throw new Error('请先设置服务器地址');
        }

        console.log('[协作] 创建房间...');

        try {
            // 1. 调用 API 获取房间密钥
            const response = await fetch(`${this.serverUrl}/api/create-room`);
            const data = await response.json();
            
            if (!data.roomKey) {
                throw new Error('创建房间失败');
            }

            this.roomKey = data.roomKey;
            this.memberId = this.generateMemberId();

            console.log('[协作] 房间密钥:', this.roomKey);

            // 2. 连接 WebSocket
            const wsUrl = this.serverUrl
                .replace('https://', 'wss://')
                .replace('http://', 'ws://');
            
            const url = `${wsUrl}/room/${this.roomKey}?memberId=${this.memberId}&username=${encodeURIComponent(this.username)}`;
            
            return this.connectWebSocket(url, true);
        } catch (e) {
            console.error('[协作] 创建房间失败:', e);
            throw e;
        }
    }

    // 加入房间（Workers 模式）
    async joinRoom(roomKey, serverUrl = null) {
        if (serverUrl) {
            this.setServer(serverUrl, 'workers');
        }

        if (!this.serverUrl) {
            throw new Error('请先设置服务器地址');
        }

        if (!roomKey) {
            throw new Error('请输入房间密钥');
        }

        console.log('[协作] 加入房间:', roomKey);

        this.roomKey = roomKey.toUpperCase();
        this.memberId = this.generateMemberId();

        // 连接 WebSocket
        const wsUrl = this.serverUrl
            .replace('https://', 'wss://')
            .replace('http://', 'ws://');
        
        const url = `${wsUrl}/room/${this.roomKey}?memberId=${this.memberId}&username=${encodeURIComponent(this.username)}`;
        
        return this.connectWebSocket(url, false);
    }

    // 连接 WebSocket
    connectWebSocket(url, isCreating = false) {
        return new Promise((resolve, reject) => {
            try {
                // 如果已有连接，先关闭
                if (this.ws) {
                    this.ws.close();
                    this.ws = null;
                }

                this.ws = new WebSocket(url);

                let resolved = false;

                this.ws.onopen = () => {
                    console.log('[协作] WebSocket 已连接');
                    this.isConnected = true;
                    this.emit('connected');
                };

                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        
                        // 如果是房间创建/加入成功消息，resolve Promise
                        if (!resolved && (data.type === 'room-created' || data.type === 'room-joined')) {
                            resolved = true;
                            this.handleMessage(data);
                            resolve(data);
                            return;
                        }

                        this.handleMessage(data);
                    } catch (e) {
                        console.error('[协作] 消息解析失败:', e);
                    }
                };

                this.ws.onclose = () => {
                    console.log('[协作] 连接断开');
                    this.isConnected = false;
                    this.emit('disconnected');
                    
                    if (!resolved) {
                        reject(new Error('连接断开'));
                    }
                };

                this.ws.onerror = (error) => {
                    console.error('[协作] 连接错误:', error);
                    this.emit('error', error);
                    
                    if (!resolved) {
                        reject(error);
                    }
                };

                // 超时处理
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        reject(new Error('连接超时'));
                    }
                }, 10000);

            } catch (e) {
                reject(e);
            }
        });
    }

    // ========== Node.js 模式（兼容旧版） ==========

    // 连接服务器（Node.js 模式）
    connect(serverUrl = 'ws://localhost:8765') {
        this.serverType = 'node';
        this.serverUrl = serverUrl;

        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(serverUrl);

                this.ws.onopen = () => {
                    console.log('[协作] 已连接到服务器');
                    this.isConnected = true;
                    this.emit('connected');
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleMessage(data);
                    } catch (e) {
                        console.error('[协作] 消息解析失败:', e);
                    }
                };

                this.ws.onclose = () => {
                    console.log('[协作] 连接断开');
                    this.isConnected = false;
                    this.roomKey = null;
                    this.isHost = false;
                    this.members = [];
                    this.emit('disconnected');
                };

                this.ws.onerror = (error) => {
                    console.error('[协作] 连接错误:', error);
                    this.emit('error', error);
                    reject(error);
                };
            } catch (e) {
                reject(e);
            }
        });
    }

    // 断开连接
    disconnect() {
        // 停止增量同步
        this.stopIncrementalSync();
        
        // 停止鼠标跟踪
        this.stopMouseTracking();
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.roomKey = null;
        this.isHost = false;
        this.members = [];
        this.memberId = null;
    }

    // 离开房间
    leaveRoom() {
        if (this.isConnected && this.roomKey && this.serverType === 'node') {
            this.send({ type: 'leave-room' });
        }
        // 清除保存的房间信息
        this.clearRoomInfo();
        this.disconnect();
    }

    // 踢出成员
    kickMember(memberId, reason = '') {
        if (!this.isHost) return;
        this.send({
            type: 'kick-member',
            memberId: memberId,
            reason: reason
        });
    }

    // 发送消息
    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    // 处理消息
    handleMessage(data) {
        switch (data.type) {
            case 'room-created':
                this.roomKey = data.roomKey;
                this.isHost = data.isHost;
                this.members = data.members;
                this.emit('room-created', data);
                this.emit('members-updated', this.members);
                
                // 保存房间信息到 localStorage，刷新后可以自动重连
                this.saveRoomInfo();
                
                // 创建房间后，发送一次完整项目数据
                this.sendFullProjectUpdate();
                
                // 暂时禁用增量同步，先保证稳定
                // this.startIncrementalSync();
                break;

            case 'room-joined':
                this.roomKey = data.roomKey;
                this.isHost = data.isHost;
                this.members = data.members;
                this.emit('room-joined', data);
                this.emit('members-updated', this.members);
                
                // 保存房间信息到 localStorage，刷新后可以自动重连
                this.saveRoomInfo();
                
                // 如果有完整项目数据，加载完整项目（包含图片等资源）
                if (data.fullProjectData && this.vm) {
                    // 暂时禁用增量同步
                    // const onProjectLoaded = () => {
                    //     this.startIncrementalSync();
                    //     this.off('project-loaded', onProjectLoaded);
                    // };
                    // this.on('project-loaded', onProjectLoaded);
                    
                    this.loadFullProjectData(data.fullProjectData);
                } else if (data.projectData && this.vm) {
                    // 否则只加载 JSON 数据
                    // const onProjectLoaded = () => {
                    //     this.startIncrementalSync();
                    //     this.off('project-loaded', onProjectLoaded);
                    // };
                    // this.on('project-loaded', onProjectLoaded);
                    
                    this.loadProjectData(data.projectData);
                } else {
                    // 没有项目数据，暂时禁用增量同步
                    // this.startIncrementalSync();
                }
                break;

            case 'member-joined':
                this.members.push(data.member);
                this.emit('member-joined', data.member);
                this.emit('members-updated', this.members);
                break;

            case 'member-left':
                this.members = this.members.filter(m => m.id !== data.memberId);
                this.emit('member-left', data.memberId);
                this.emit('members-updated', this.members);
                break;

            case 'host-changed':
                this.members.forEach(m => {
                    m.isHost = m.id === data.newHostId;
                });
                if (this.memberId && data.newHostId === this.memberId) {
                    this.isHost = true;
                }
                this.emit('host-changed', data.newHostId);
                this.emit('members-updated', this.members);
                break;

            case 'project-update':
                this.emit('project-update', data);
                // 加载项目数据
                if (this.vm && !this.isLoadingProject) {
                    // 如果有完整项目数据（包含图片、声音等），优先加载完整项目
                    if (data.fullProjectData) {
                        console.log('[协作] 收到完整项目数据，加载中...');
                        this.loadFullProjectData(data.fullProjectData);
                    } else if (data.projectData) {
                        // 否则只加载 JSON 数据
                        this.loadProjectData(data.projectData);
                    }
                }
                break;

            case 'kicked':
                this.emit('kicked', data);
                // 被踢出后清除保存的房间信息，避免自动重连
                this.clearRoomInfo();
                this.disconnect();
                break;

            case 'chat':
                this.emit('chat', data);
                break;

            case 'mouse-move':
                this.handleMouseMove(data);
                break;

            case 'blockly-event':
                this.handleRemoteBlocklyEvent(data);
                break;

            case 'error':
                this.emit('error', data);
                break;

            default:
                console.log('[协作] 未知消息类型:', data.type);
        }
    }

    // 处理鼠标移动（接收）
    handleMouseMove(data) {
        if (!data.memberId) return;
        
        const color = this.getMemberColor(data.memberId);
        this.mousePositions[data.memberId] = {
            x: data.x,
            y: data.y,
            color: color
        };
        
        this.emit('mouse-move', {
            memberId: data.memberId,
            x: data.x,
            y: data.y,
            color: color
        });
    }

    // 发送鼠标位置
    sendMousePosition(x, y) {
        if (!this.isConnected || !this.roomKey) return;
        
        // 节流，避免发送太频繁
        const now = Date.now();
        if (this.lastMousePosition && now - this.lastMousePosition.time < this.mouseThrottleTime) {
            return;
        }
        
        this.lastMousePosition = { x, y, time: now };
        
        this.send({
            type: 'mouse-move',
            x: x,
            y: y
        });
    }

    // 获取成员颜色
    getMemberColor(memberId) {
        if (!this.memberColors[memberId]) {
            // 根据成员数量分配颜色
            const usedColors = Object.values(this.memberColors);
            const availableColor = this.colorPalette.find(c => !usedColors.includes(c));
            this.memberColors[memberId] = availableColor || this.colorPalette[Object.keys(this.memberColors).length % this.colorPalette.length];
        }
        return this.memberColors[memberId];
    }

    // 开始鼠标跟踪
    startMouseTracking() {
        if (this._mouseMoveHandler) return; // 已经在跟踪了

        this._mouseMoveHandler = (e) => {
            // 转换为视口百分比（0-1），适配不同分辨率
            const viewportX = e.clientX / window.innerWidth;
            const viewportY = e.clientY / window.innerHeight;
            this.sendMousePosition(viewportX, viewportY);
        };

        window.addEventListener('mousemove', this._mouseMoveHandler);
        console.log('[协作] 鼠标跟踪已启动');
    }

    // 停止鼠标跟踪
    stopMouseTracking() {
        if (this._mouseMoveHandler) {
            window.removeEventListener('mousemove', this._mouseMoveHandler);
            this._mouseMoveHandler = null;
        }
        // 清空鼠标位置
        this.mousePositions = {};
        this.emit('mouse-positions-updated', this.mousePositions);
        console.log('[协作] 鼠标跟踪已停止');
    }

    // ========== 增量同步（Blockly 事件） ==========

    // 开始增量同步
    startIncrementalSync() {
        if (this.isIncrementalSyncActive) return;
        
        const workspace = AddonHooks.blocklyWorkspace;
        if (!workspace) {
            console.warn('[协作] Blockly 工作区不存在，无法启动增量同步');
            // 延迟重试
            setTimeout(() => this.startIncrementalSync(), 1000);
            return;
        }

        // 添加变化监听器
        this._blocklyChangeListener = (event) => {
            this.handleBlocklyChange(event);
        };
        
        workspace.addChangeListener(this._blocklyChangeListener);
        this.isIncrementalSyncActive = true;
        
        console.log('[协作] 增量同步已启动');
    }

    // 停止增量同步
    stopIncrementalSync() {
        if (!this.isIncrementalSyncActive) return;
        
        const workspace = AddonHooks.blocklyWorkspace;
        if (workspace && this._blocklyChangeListener) {
            workspace.removeChangeListener(this._blocklyChangeListener);
            this._blocklyChangeListener = null;
        }
        
        // 清除 MOVE 事件防抖定时器
        if (this.moveEventTimeout) {
            clearTimeout(this.moveEventTimeout);
            this.moveEventTimeout = null;
        }
        this.lastMoveEvent = null;
        
        this.isIncrementalSyncActive = false;
        console.log('[协作] 增量同步已停止');
    }

    // 处理本地 Blockly 变化
    handleBlocklyChange(event) {
        // 如果正在应用远程事件，不发送（避免循环）
        if (this.isApplyingRemoteEvent) return;
        
        // 如果没有连接或不在房间里，不发送
        if (!this.isConnected || !this.roomKey) return;
        
        // 过滤掉一些不需要同步的事件
        if (!event) return;
        
        // 跳过 UI 相关的事件（如点击、选择等）
        const skipTypes = ['click', 'selected', 'viewport_change', 'theme', 'toolbox_item_select'];
        if (skipTypes.includes(event.type)) return;
        
        // 序列化事件
        let eventJson;
        try {
            eventJson = event.toJson();
        } catch (e) {
            console.warn('[协作] 事件序列化失败:', e);
            return;
        }
        
        // MOVE 事件做防抖处理，拖拽过程中不发送，停下来后才发送最终位置
        // 避免频繁发送导致卡顿，也不需要同步拖拽过程
        if (event.type === 'move') {
            this.lastMoveEvent = eventJson;
            if (this.moveEventTimeout) {
                clearTimeout(this.moveEventTimeout);
            }
            this.moveEventTimeout = setTimeout(() => {
                if (this.lastMoveEvent) {
                    this.send({
                        type: 'blockly-event',
                        event: this.lastMoveEvent
                    });
                    this.lastMoveEvent = null;
                }
            }, 200); // 200ms 防抖，停下来后才发送
            return;
        }
        
        // 其他事件立即发送
        this.send({
            type: 'blockly-event',
            event: eventJson
        });
    }

    // 处理远程 Blockly 事件
    handleRemoteBlocklyEvent(data) {
        const workspace = AddonHooks.blocklyWorkspace;
        if (!workspace) {
            console.warn('[协作] Blockly 工作区不存在，无法应用远程事件');
            return;
        }
        
        const ScratchBlocks = AddonHooks.blockly;
        if (!ScratchBlocks || !ScratchBlocks.Events) {
            console.warn('[协作] ScratchBlocks 不存在，无法应用远程事件');
            return;
        }
        
        try {
            // 标记正在应用远程事件，避免循环发送和触发全量同步
            this.isApplyingRemoteEvent = true;
            
            // 反序列化事件
            const event = ScratchBlocks.Events.fromJson(data.event, workspace);
            
            // 如果是 CREATE 事件，检查积木是否已存在（防止重复）
            if (event.type === ScratchBlocks.Events.CREATE && event.ids) {
                const allExist = event.ids.every(id => workspace.getBlockById(id));
                if (allExist) {
                    console.log('[协作] 积木已存在，跳过 CREATE 事件');
                    return;
                }
            }
            
            // 如果是 DELETE 事件，检查积木是否已不存在
            if (event.type === ScratchBlocks.Events.DELETE && event.ids) {
                const allDeleted = event.ids.every(id => !workspace.getBlockById(id));
                if (allDeleted) {
                    console.log('[协作] 积木已删除，跳过 DELETE 事件');
                    return;
                }
            }
            
            // 运行事件（应用到工作区）
            event.run(true); // true = 正向应用事件
            
            console.log('[协作] 已应用远程事件:', data.event.type);
        } catch (e) {
            console.error('[协作] 应用远程事件失败:', e);
        } finally {
            // 取消标记
            this.isApplyingRemoteEvent = false;
        }
    }

    // 设置 VM 监听器
    setupVMListeners() {
        if (!this.vm) {
            console.log('[协作] VM 不存在，无法设置监听器');
            return;
        }

        console.log('[协作] 设置 VM 监听器...');

        // 监听工作区变化（防抖）
        const handleWorkspaceChange = (source) => {
            if (!this.roomKey || !this.isConnected || this.isLoadingProject) return;
            
            // 如果正在应用远程事件，不触发全量同步（避免循环和冲突）
            if (this.isApplyingRemoteEvent) return;
            
            // 检测是否是资源相关的变化（需要发送完整项目）
            const resourceEvents = [
                'COSTUME_ADDED', 'costumeAdded',
                'SOUND_ADDED', 'soundAdded',
                'SPRITE_ADDED', 'spriteAdded',
                'runtime.COSTUME_ADDED', 'runtime.SOUND_ADDED', 'runtime.SPRITE_ADDED'
            ];
            if (resourceEvents.includes(source)) {
                this.hasResourceChange = true;
            }
            
            // 如果增量同步已激活，且是纯积木相关的事件，则不发送全量同步
            // 避免闪烁和抽搐，积木变化通过增量同步处理
            // 注意：不过滤 PROJECT_CHANGED，因为角色、造型等变化也会触发这个事件
            if (this.isIncrementalSyncActive) {
                const isBlockOnlyEvent = source === 'workspaceUpdate' || 
                                       source === 'runtime.workspaceUpdate' ||
                                       source === 'workspaceChanged' ||
                                       source === 'runtime.workspaceChanged' ||
                                       source === 'BLOCKSINFO_UPDATE' ||
                                       source === 'runtime.BLOCKSINFO_UPDATE' ||
                                       source === 'blocksInfoUpdate';
                if (isBlockOnlyEvent) {
                    return; // 纯积木变化通过增量同步处理，不触发全量同步
                }
            }
            
            // 防抖，避免频繁发送
            if (this.projectUpdateTimeout) {
                clearTimeout(this.projectUpdateTimeout);
            }
            
            // 增量同步激活时，加长防抖时间，避免积木编辑时频繁触发全量同步
            const debounceTime = this.isIncrementalSyncActive ? 1500 : 300;
            
            this.projectUpdateTimeout = setTimeout(() => {
                this.sendProjectUpdate();
            }, debounceTime);
        };

        // 尝试监听各种可能的事件
        const eventsToTry = [
            'workspaceUpdate',
            'workspaceChanged',
            'PROJECT_CHANGED',
            'projectChanged',
            'BLOCKSINFO_UPDATE',
            'blocksInfoUpdate',
            'EXTENSION_ADDED',
            'extensionAdded',
            'SPRITE_ADDED',
            'spriteAdded',
            'SPRITE_RENAMED',
            'spriteRenamed',
            'COSTUME_ADDED',
            'costumeAdded',
            'SOUND_ADDED',
            'soundAdded'
        ];

        eventsToTry.forEach(eventName => {
            try {
                this.vm.on(eventName, () => handleWorkspaceChange(eventName));
            } catch (e) {
                // 忽略
            }
        });

        // 也尝试监听 runtime 的事件
        if (this.vm.runtime) {
            const runtimeEvents = [
                'PROJECT_CHANGED',
                'workspaceUpdate',
                'BLOCKSINFO_UPDATE',
                'EXTENSION_ADDED',
                'SPRITE_ADDED',
                'SPRITE_REMOVED'
            ];

            runtimeEvents.forEach(eventName => {
                try {
                    this.vm.runtime.on(eventName, () => handleWorkspaceChange('runtime.' + eventName));
                } catch (e) {
                    // 忽略
                }
            });
        }

        console.log('[协作] VM 监听器设置完成');
    }

    // 发送项目更新
    async sendProjectUpdate() {
        if (!this.vm || !this.roomKey || !this.isConnected || this.isLoadingProject) {
            return;
        }

        try {
            const projectData = this.vm.toJSON();
            
            // 简单比较，避免重复发送相同数据
            const dataStr = JSON.stringify(projectData);
            if (dataStr === this.lastProjectData && !this.hasResourceChange) {
                return;
            }
            
            this.lastProjectData = dataStr;
            
            // 如果有资源变化，发送完整项目（包含图片、声音等）
            if (this.hasResourceChange) {
                console.log('[协作] 检测到资源变化，发送完整项目数据...');
                const fullProjectData = await this.getFullProjectData();
                if (fullProjectData) {
                    this.send({
                        type: 'project-update',
                        projectData: projectData,
                        fullProjectData: fullProjectData
                    });
                    console.log('[协作] 完整项目数据已发送');
                }
                this.hasResourceChange = false; // 清除标记
            } else {
                // 否则只发送 JSON 数据（更快）
                this.send({
                    type: 'project-update',
                    projectData: projectData
                });
            }
        } catch (e) {
            console.error('[协作] 发送项目更新失败:', e);
        }
    }

    // 发送完整项目更新（包含所有资源，如图片、声音等）
    async sendFullProjectUpdate() {
        if (!this.vm || !this.roomKey || !this.isConnected) {
            return;
        }

        try {
            console.log('[协作] 正在发送完整项目数据...');
            
            const fullProjectData = await this.getFullProjectData();
            const projectData = this.vm.toJSON();
            
            if (fullProjectData) {
                this.send({
                    type: 'project-update',
                    projectData: projectData,
                    fullProjectData: fullProjectData
                });
                console.log('[协作] 完整项目数据已发送');
            }
            
            // 更新 lastProjectData
            this.lastProjectData = JSON.stringify(projectData);
        } catch (e) {
            console.error('[协作] 发送完整项目更新失败:', e);
        }
    }

    // 获取完整项目数据（sb3 格式，base64 编码）
    async getFullProjectData() {
        if (!this.vm) return null;
        
        try {
            const sb3Buffer = await this.vm.saveProjectSb3();
            // 转成 base64
            const base64 = this.arrayBufferToBase64(sb3Buffer);
            return base64;
        } catch (e) {
            console.error('[协作] 导出完整项目失败:', e);
            return null;
        }
    }

    // ArrayBuffer 转 base64
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // base64 转 ArrayBuffer
    base64ToArrayBuffer(base64) {
        const binary_string = atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }

    // 加载完整项目数据（sb3 格式，base64 编码）
    async loadFullProjectData(base64Data) {
        if (!this.vm) {
            console.error('[协作] 无法加载项目：VM 不存在');
            return;
        }

        this.isLoadingProject = true;

        try {
            const arrayBuffer = this.base64ToArrayBuffer(base64Data);
            await this.vm.loadProject(arrayBuffer);
            console.log('[协作] 完整项目已同步成功');
            
            // 更新 lastProjectData
            const projectData = this.vm.toJSON();
            this.lastProjectData = JSON.stringify(projectData);
            
            this.isLoadingProject = false;
            this.emit('project-loaded');
        } catch (e) {
            console.error('[协作] 加载完整项目失败:', e);
            this.isLoadingProject = false;
        }
    }

    // 加载项目数据
    loadProjectData(projectData) {
        if (!this.vm) {
            console.error('[协作] 无法加载项目：VM 不存在');
            return;
        }

        this.isLoadingProject = true;

        try {
            this.vm.loadProject(projectData).then(() => {
                console.log('[协作] 项目已同步成功');
                this.lastProjectData = JSON.stringify(projectData);
                this.isLoadingProject = false;
                this.emit('project-loaded');
            }).catch(e => {
                console.error('[协作] 加载项目失败:', e);
                this.isLoadingProject = false;
            });
        } catch (e) {
            console.error('[协作] 加载项目异常:', e);
            this.isLoadingProject = false;
        }
    }

    // 事件系统
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    emit(event, data) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(callback => {
            try {
                callback(data);
            } catch (e) {
                console.error(`[协作] 事件监听器错误 (${event}):`, e);
            }
        });
    }
}

// 创建单例
const collaborationManager = new CollaborationManager();

export default collaborationManager;
