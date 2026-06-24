// 多人协作管理器
// 处理 WebSocket 连接、房间管理、项目同步

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

    // 连接服务器
    connect(serverUrl = 'ws://localhost:8765') {
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
    }

    // 创建房间
    createRoom() {
        if (!this.isConnected) {
            return Promise.reject(new Error('未连接到服务器'));
        }

        return new Promise((resolve, reject) => {
            const onRoomCreated = (data) => {
                this.off('room-created', onRoomCreated);
                this.off('error', onError);
                resolve(data);
            };

            const onError = (error) => {
                this.off('room-created', onRoomCreated);
                this.off('error', onError);
                reject(new Error(error.message || '创建房间失败'));
            };

            this.on('room-created', onRoomCreated);
            this.on('error', onError);

            this.send({
                type: 'create-room',
                username: this.username
            });
        });
    }

    // 加入房间
    joinRoom(roomKey) {
        if (!this.isConnected) {
            return Promise.reject(new Error('未连接到服务器'));
        }

        return new Promise((resolve, reject) => {
            const onRoomJoined = (data) => {
                this.off('room-joined', onRoomJoined);
                this.off('error', onError);
                resolve(data);
            };

            const onError = (error) => {
                this.off('room-joined', onRoomJoined);
                this.off('error', onError);
                reject(new Error(error.message || '加入房间失败'));
            };

            this.on('room-joined', onRoomJoined);
            this.on('error', onError);

            this.send({
                type: 'join-room',
                roomKey: roomKey,
                username: this.username
            });
        });
    }

    // 离开房间
    leaveRoom() {
        if (this.isConnected && this.roomKey) {
            this.send({ type: 'leave-room' });
        }
        this.roomKey = null;
        this.isHost = false;
        this.members = [];
        this.lastProjectData = null;
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
                if (this.ws && data.newHostId === this.ws.id) {
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
                this.leaveRoom();
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
        console.log('[协作] VM 方法:', Object.keys(this.vm).filter(k => typeof this.vm[k] === 'function').slice(0, 20));

        // 监听工作区变化（防抖）
        const handleWorkspaceChange = (source) => {
            if (!this.roomKey || !this.isConnected || this.isLoadingProject) return;
            
            console.log('[协作] 检测到工作区变化，来源:', source);
            
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
                console.log('[协作] 已监听事件:', eventName);
            } catch (e) {
                // 忽略
            }
        });

        // 也尝试监听 runtime 的事件
        if (this.vm.runtime) {
            console.log('[协作] 尝试监听 runtime 事件...');
            
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
                    console.log('[协作] 已监听 runtime 事件:', eventName);
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
            console.log('[协作] 跳过发送:', {
                hasVM: !!this.vm,
                hasRoomKey: !!this.roomKey,
                isConnected: this.isConnected,
                isLoadingProject: this.isLoadingProject
            });
            return;
        }

        try {
            console.log('[协作] 正在序列化项目数据...');
            const projectData = this.vm.toJSON();
            
            // 简单比较，避免重复发送相同数据
            const dataStr = JSON.stringify(projectData);
            if (dataStr === this.lastProjectData) {
                console.log('[协作] 项目数据未变化，跳过发送');
                return;
            }
            
            console.log('[协作] 发送项目更新，数据大小:', dataStr.length, '字节');
            this.lastProjectData = dataStr;

            this.send({
                type: 'project-update',
                projectData: projectData
            });
            
            console.log('[协作] 项目更新已发送');
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

        console.log('[协作] 收到项目更新，正在加载...');
        this.isLoadingProject = true;

        try {
            this.vm.loadProject(projectData).then(() => {
                console.log('[协作] 项目已同步成功');
                this.lastProjectData = JSON.stringify(projectData);
                this.isLoadingProject = false;
                
                // 触发一个事件通知 UI
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
