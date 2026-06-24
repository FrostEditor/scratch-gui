// 多人协作管理器
// 支持 Cloudflare Workers + Durable Objects 模式
// 也兼容 Node.js 服务器模式

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
    }

    // 设置 VM
    setVM(vm) {
        this.vm = vm;
        this.setupVMListeners();
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
                break;

            case 'room-joined':
                this.roomKey = data.roomKey;
                this.isHost = data.isHost;
                this.members = data.members;
                this.emit('room-joined', data);
                this.emit('members-updated', this.members);
                
                // 如果有项目数据，加载它
                if (data.projectData && this.vm) {
                    this.loadProjectData(data.projectData);
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
                if (this.vm && data.projectData && !this.isLoadingProject) {
                    this.loadProjectData(data.projectData);
                }
                break;

            case 'kicked':
                this.emit('kicked', data);
                this.disconnect();
                break;

            case 'chat':
                this.emit('chat', data);
                break;

            case 'error':
                this.emit('error', data);
                break;

            default:
                console.log('[协作] 未知消息类型:', data.type);
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
            
            // 防抖，避免频繁发送
            if (this.projectUpdateTimeout) {
                clearTimeout(this.projectUpdateTimeout);
            }
            
            this.projectUpdateTimeout = setTimeout(() => {
                this.sendProjectUpdate();
            }, 800); // 800ms 防抖
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
    sendProjectUpdate() {
        if (!this.vm || !this.roomKey || !this.isConnected || this.isLoadingProject) {
            return;
        }

        try {
            const projectData = this.vm.toJSON();
            
            // 简单比较，避免重复发送相同数据
            const dataStr = JSON.stringify(projectData);
            if (dataStr === this.lastProjectData) {
                return;
            }
            
            this.lastProjectData = dataStr;

            this.send({
                type: 'project-update',
                projectData: projectData
            });
        } catch (e) {
            console.error('[协作] 发送项目更新失败:', e);
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
