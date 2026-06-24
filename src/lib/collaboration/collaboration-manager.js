// 多人协作管理器 - WebRTC P2P 版本
// WebSocket 仅用于信令和房间管理，所有数据通过 WebRTC 直连传输
// Mesh 网络拓扑：每个人和所有人都建立直连

import AddonHooks from '../../addons/hooks.js';

class CollaborationManager {
    constructor() {
        // WebSocket 信令连接
        this.ws = null;
        this.roomKey = null;
        this.isHost = false;
        this.hostToken = null; // 房主令牌，用于恢复房主身份
        this.members = [];
        this.username = '用户';
        this.vm = null;
        this.listeners = {};
        this.isConnected = false;
        this._isLeavingRoom = false; // 是否是主动离开房间
        this._reconnectAttempts = 0;
        this._maxReconnectAttempts = 5;
        this._reconnectTimeout = null;
        this.memberId = null;
        this.serverUrl = null;
        this.serverType = 'workers';
        
        // WebRTC 相关
        this.rtcConnections = {}; // memberId -> { pc, channel, isOpen }
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };
        this.pendingCandidates = {}; // memberId -> [candidates] 等待连接建立后再添加
        
        // 项目同步
        this.projectUpdateTimeout = null;
        this.lastProjectData = null;
        this.isLoadingProject = false;
        this.hasReceivedProject = false; // 是否已收到过项目数据
        this.hasResourceChange = false;
        this._lastSpriteCount = undefined;
        this._lastTotalCostumes = undefined;
        this._lastTotalSounds = undefined;
        
        // 鼠标同步
        this.mousePositions = {};
        this.lastMousePosition = null;
        this.mouseThrottleTime = 16; // 60fps，更流畅
        this._lastMouseSendTime = 0;
        this.memberColors = {};
        this.cursorElements = {}; // 成员光标 DOM 元素
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
        
        // 积木同步
        this.isApplyingRemoteEvent = false;
        this._lastBlocksData = null;
        this._lastBlocksTargetId = null;
        this._blocksChangeListener = null;
        this.isBlocksSyncActive = false;
        this._lastMoveEventSendTime = 0; // move 事件节流
        
        // 聊天
        this.chatMessages = [];
        
        // 自动重连
        this._isLeavingRoom = false;
        this._reconnectAttempts = 0;
        this._reconnectTimeout = null;
        this._maxReconnectAttempts = 999; // 几乎无限重试，保持连接不断开
        
        // 资源变化定期检测
        this._resourceCheckInterval = null;
        
        // 从 localStorage 读取用户名
        try {
            const savedUsername = localStorage.getItem('collaborationUsername');
            if (savedUsername) {
                this.username = savedUsername;
            }
        } catch (e) {
            // 忽略
        }
    }
    
    // ========== 事件系统 ==========
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
        this.listeners[event].forEach(cb => cb(data));
    }
    
    // ========== 设置 VM ==========
    setVM(vm) {
        this.vm = vm;
        this.setupVMListeners();
        
        // 尝试恢复上次的房间
        setTimeout(() => {
            this.restoreLastRoom();
        }, 1000);
    }
    
    // ========== 房间管理 ==========
    
    // 生成成员 ID
    generateMemberId() {
        return 'member_' + Math.random().toString(36).substr(2, 9);
    }
    
    // 保存房间信息
    saveRoomInfo() {
        try {
            const roomInfo = {
                roomKey: this.roomKey,
                serverUrl: this.serverUrl,
                serverType: this.serverType,
                username: this.username,
                hostToken: this.hostToken // 保存房主令牌
            };
            localStorage.setItem('collaborationRoomInfo', JSON.stringify(roomInfo));
        } catch (e) {
            console.warn('[协作] 保存房间信息失败:', e);
        }
    }
    
    // 清除房间信息
    clearRoomInfo() {
        try {
            localStorage.removeItem('collaborationRoomInfo');
        } catch (e) {
            console.warn('[协作] 清除房间信息失败:', e);
        }
    }
    
    // 恢复上次的房间
    restoreLastRoom() {
        try {
            const saved = localStorage.getItem('collaborationRoomInfo');
            if (!saved) return;
            
            const roomInfo = JSON.parse(saved);
            if (roomInfo.roomKey && roomInfo.serverUrl) {
                console.log('[协作] 恢复上次的房间连接...');
                this.setServer(roomInfo.serverUrl, roomInfo.serverType);
                if (roomInfo.username) {
                    this.username = roomInfo.username;
                }
                if (roomInfo.hostToken) {
                    this.hostToken = roomInfo.hostToken;
                    console.log('[协作] 恢复房主令牌');
                }
                this.joinRoom(roomInfo.roomKey);
            }
        } catch (e) {
            console.warn('[协作] 恢复房间失败:', e);
            this.clearRoomInfo();
        }
    }
    
    // 设置服务器地址
    setServer(url, type = 'workers') {
        this.serverUrl = url.replace(/\/$/, '');
        this.serverType = type;
    }
    
    // 设置用户名
    setUsername(username) {
        this.username = username || '用户';
        try {
            localStorage.setItem('collaborationUsername', this.username);
        } catch (e) {
            // 忽略
        }
    }
    
    // 创建房间
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
    
    // 加入房间
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
        
        let url = `${wsUrl}/room/${this.roomKey}?memberId=${this.memberId}&username=${encodeURIComponent(this.username)}`;
        
        // 如果有房主令牌，带上
        if (this.hostToken) {
            url += `&hostToken=${encodeURIComponent(this.hostToken)}`;
        }
        
        return this.connectWebSocket(url, false);
    }
    
    // 连接 WebSocket
    connectWebSocket(url, isCreating = false) {
        return new Promise((resolve, reject) => {
            try {
                // 重置离开状态，允许自动重连
                this._isLeavingRoom = false;
                this._stopReconnect();
                
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
                            this.handleSignalingMessage(data);
                            
                            // 初始化
                            this.isHost = data.isHost;
                            this.members = data.members || [];
                            
                            // 保存房主令牌
                            if (data.hostToken) {
                                this.hostToken = data.hostToken;
                                console.log('[协作] 收到房主令牌');
                            }
                            
                            this.saveRoomInfo();
                            this.startBlocksSync();
                            this.startMouseTracking();

                            // 如果是房主，给所有已连接的成员补发初始项目
                            if (this.isHost && this.vm) {
                                console.log('[协作] 确认房主身份，给所有已连接成员发送初始项目');
                                Object.keys(this.rtcConnections).forEach(peerMemberId => {
                                    if (this.rtcConnections[peerMemberId]?.isOpen) {
                                        console.log('[协作] 补发初始项目给:', peerMemberId);
                                        this.sendProjectUpdate(true);
                                    }
                                });
                            }
                            
                            // 和所有已有的成员建立 WebRTC 连接
                            // 只有 memberId 字典序较小的一方主动发起，避免重复连接
                            if (data.members) {
                                data.members.forEach(member => {
                                    if (member.id !== this.memberId && this.memberId < member.id) {
                                        this.initiateRTCConnection(member.id);
                                    }
                                });
                            }
                            
                            resolve(data);
                            return;
                        }
                        
                        this.handleSignalingMessage(data);
                    } catch (e) {
                        console.error('[协作] 消息解析失败:', e);
                    }
                };
                
                this.ws.onerror = (error) => {
                    console.error('[协作] WebSocket 错误:', error);
                    if (!resolved) {
                        reject(error);
                    }
                };
                
                this.ws.onclose = () => {
                    console.log('[协作] WebSocket 连接关闭');
                    this.isConnected = false;
                    this.closeAllRTCConnections();
                    this.emit('disconnected');
                    
                    if (!resolved) {
                        reject(new Error('连接断开'));
                    }
                    
                    // 自动重连（如果不是主动离开房间）
                    if (!this._isLeavingRoom && this.roomKey) {
                        this._attemptReconnect();
                    }
                };
                
                // 超时处理
                setTimeout(() => {
                    if (!resolved) {
                        reject(new Error('连接超时'));
                    }
                }, 10000);
            } catch (e) {
                reject(e);
            }
        });
    }
    
    // 尝试自动重连
    _attemptReconnect() {
        if (this._isLeavingRoom) return;
        if (this._reconnectAttempts >= this._maxReconnectAttempts) {
            console.log('[协作] 已达到最大重连次数，停止重连');
            return;
        }
        
        this._reconnectAttempts++;
        
        // 指数退避：3秒、5秒、8秒、12秒... 最多30秒
        const delay = Math.min(3000 + (this._reconnectAttempts - 1) * 2000, 30000);
        
        console.log(`[协作] 尝试第 ${this._reconnectAttempts} 次重连，${delay / 1000}秒后重试`);
        
        this._reconnectTimeout = setTimeout(() => {
            if (this._isLeavingRoom) return;
            
            console.log('[协作] 正在重连...');
            
            // 重新加入房间
            this.joinRoom(this.roomKey)
                .then(() => {
                    console.log('[协作] 重连成功');
                    this._reconnectAttempts = 0;
                    this.emit('reconnected');
                })
                .catch((err) => {
                    console.error('[协作] 重连失败:', err);
                    // 继续尝试重连
                    this._attemptReconnect();
                });
        }, delay);
    }
    
    // 停止重连
    _stopReconnect() {
        if (this._reconnectTimeout) {
            clearTimeout(this._reconnectTimeout);
            this._reconnectTimeout = null;
        }
        this._reconnectAttempts = 0;
    }
    // 离开房间
    leaveRoom() {
        this._isLeavingRoom = true;
        this._stopReconnect();
        this.stopBlocksSync();
        this.stopMouseTracking();
        this.clearRoomInfo();
        this.closeAllRTCConnections();
        
        if (this.ws) {
            try {
                this.ws.send(JSON.stringify({
                    type: 'leave-room',
                    roomKey: this.roomKey,
                    memberId: this.memberId
                }));
            } catch (e) {
                // 忽略
            }
            this.ws.close();
            this.ws = null;
        }
        
        this.roomKey = null;
        this.isHost = false;
        this.members = [];
        this.isConnected = false;
        this.hasReceivedProject = false;
        this.mousePositions = {};
        this.memberColors = {};
        this.emit('left');
    }
    
    // ========== WebRTC 连接管理 ==========
    
    // 主动发起 WebRTC 连接
    async initiateRTCConnection(peerMemberId) {
        console.log('[协作] 发起 WebRTC 连接到:', peerMemberId);
        
        const pc = new RTCPeerConnection(this.rtcConfig);
        // 使用有序可靠模式，更稳定
        const channel = pc.createDataChannel('collaboration');
        
        this.rtcConnections[peerMemberId] = {
            pc: pc,
            channel: channel,
            isOpen: false
        };
        
        // 设置数据通道
        this.setupDataChannel(channel, peerMemberId);
        
        // ICE candidate
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignalingMessage(peerMemberId, {
                    type: 'webrtc-candidate',
                    candidate: event.candidate
                });
            }
        };
        
        // 连接状态变化
        pc.onconnectionstatechange = () => {
            console.log('[协作] WebRTC 连接状态变化:', peerMemberId, pc.connectionState);
            if (pc.connectionState === 'connected') {
                console.log('[协作] WebRTC 连接成功:', peerMemberId);
            } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                console.warn('[协作] WebRTC 连接失败:', peerMemberId);
                this.removeRTCConnection(peerMemberId);
            }
        };
        
        // 创建 offer
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            this.sendSignalingMessage(peerMemberId, {
                type: 'webrtc-offer',
                offer: offer
            });
        } catch (e) {
            console.error('[协作] 创建 offer 失败:', e);
            this.removeRTCConnection(peerMemberId);
        }
    }
    
    // 处理收到的 offer
    async handleRTCOffer(fromMemberId, offer) {
        console.log('[协作] 收到 offer 来自:', fromMemberId);
        
        if (this.rtcConnections[fromMemberId]) {
            console.warn('[协作] 连接已存在，忽略 offer');
            return;
        }
        
        const pc = new RTCPeerConnection(this.rtcConfig);
        
        this.rtcConnections[fromMemberId] = {
            pc: pc,
            channel: null,
            isOpen: false
        };
        
        // 监听数据通道
        pc.ondatachannel = (event) => {
            const channel = event.channel;
            this.rtcConnections[fromMemberId].channel = channel;
            this.setupDataChannel(channel, fromMemberId);
        };
        
        // ICE candidate
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignalingMessage(fromMemberId, {
                    type: 'webrtc-candidate',
                    candidate: event.candidate
                });
            }
        };
        
        // 连接状态变化
        pc.onconnectionstatechange = () => {
            console.log('[协作] WebRTC 连接状态变化:', fromMemberId, pc.connectionState);
            if (pc.connectionState === 'connected') {
                console.log('[协作] WebRTC 连接成功:', fromMemberId);
            } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                console.warn('[协作] WebRTC 连接失败:', fromMemberId);
                this.removeRTCConnection(fromMemberId);
            }
        };
        
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            this.sendSignalingMessage(fromMemberId, {
                type: 'webrtc-answer',
                answer: answer
            });
            
            // 添加暂存的 candidate
            if (this.pendingCandidates[fromMemberId]) {
                this.pendingCandidates[fromMemberId].forEach(candidate => {
                    pc.addIceCandidate(new RTCIceCandidate(candidate));
                });
                delete this.pendingCandidates[fromMemberId];
            }
        } catch (e) {
            console.error('[协作] 处理 offer 失败:', e);
            this.removeRTCConnection(fromMemberId);
        }
    }
    
    // 处理收到的 answer
    async handleRTCAnswer(fromMemberId, answer) {
        console.log('[协作] 收到 answer 来自:', fromMemberId);
        
        const conn = this.rtcConnections[fromMemberId];
        if (!conn) {
            console.warn('[协作] 收到 answer 但连接不存在:', fromMemberId);
            return;
        }
        
        try {
            await conn.pc.setRemoteDescription(new RTCSessionDescription(answer));
            
            // 添加暂存的 candidate
            if (this.pendingCandidates[fromMemberId]) {
                this.pendingCandidates[fromMemberId].forEach(candidate => {
                    conn.pc.addIceCandidate(new RTCIceCandidate(candidate));
                });
                delete this.pendingCandidates[fromMemberId];
            }
        } catch (e) {
            console.error('[协作] 处理 answer 失败:', e);
            this.removeRTCConnection(fromMemberId);
        }
    }
    
    // 处理收到的 ICE candidate
    async handleICECandidate(fromMemberId, candidate) {
        const conn = this.rtcConnections[fromMemberId];
        if (!conn || !conn.pc.remoteDescription) {
            // 还没设置 remote description，先暂存
            if (!this.pendingCandidates[fromMemberId]) {
                this.pendingCandidates[fromMemberId] = [];
            }
            this.pendingCandidates[fromMemberId].push(candidate);
            return;
        }
        
        try {
            await conn.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error('[协作] 添加 ICE candidate 失败:', e);
        }
    }
    
    // 设置数据通道
    setupDataChannel(channel, peerMemberId) {
        channel.onopen = () => {
            console.log('[协作] 数据通道已打开:', peerMemberId);
            if (this.rtcConnections[peerMemberId]) {
                this.rtcConnections[peerMemberId].isOpen = true;
            }
            this.emit('peer-connected', peerMemberId);
            
            // 如果是房主，发送当前项目数据给新成员（强制完整 sb3 格式）
            if (this.isHost && this.vm) {
                console.log('[协作] 发送初始项目数据给:', peerMemberId);
                this.sendProjectUpdate(true);
            } else {
                console.log('[协作] 不发送初始数据 - isHost:', this.isHost, 'hasVM:', !!this.vm);
            }
            
            // 如果自己不是房主，延迟一下后检查有没有收到项目数据，没有就主动请求
            if (!this.isHost && !this.hasReceivedProject) {
                setTimeout(() => {
                    if (!this.hasReceivedProject && this.rtcConnections[peerMemberId]?.isOpen) {
                        console.log('[协作] 未收到项目数据，主动请求');
                        this.sendData({
                            type: 'request-project',
                            memberId: this.memberId
                        });
                    }
                }, 1000);
            }
        };
        
        channel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleDataMessage(data, peerMemberId);
            } catch (e) {
                console.error('[协作] 解析 WebRTC 消息失败:', e);
            }
        };
        
        channel.onclose = () => {
            console.log('[协作] 数据通道已关闭:', peerMemberId);
            if (this.rtcConnections[peerMemberId]) {
                this.rtcConnections[peerMemberId].isOpen = false;
            }
            this.emit('peer-disconnected', peerMemberId);
        };
        
        channel.onerror = (error) => {
            console.error('[协作] 数据通道错误:', peerMemberId, error);
        };
    }
    
    // 移除 WebRTC 连接
    removeRTCConnection(peerMemberId) {
        const conn = this.rtcConnections[peerMemberId];
        if (conn) {
            if (conn.channel) {
                try { conn.channel.close(); } catch (e) {}
            }
            if (conn.pc) {
                try { conn.pc.close(); } catch (e) {}
            }
            delete this.rtcConnections[peerMemberId];
        }
        delete this.pendingCandidates[peerMemberId];
    }
    
    // 关闭所有 WebRTC 连接
    closeAllRTCConnections() {
        Object.keys(this.rtcConnections).forEach(peerMemberId => {
            this.removeRTCConnection(peerMemberId);
        });
    }
    
    // ========== 消息发送 ==========
    
    // 发送信令消息（通过 WebSocket）
    sendSignalingMessage(toMemberId, message) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
        this.ws.send(JSON.stringify({
            type: 'signaling',
            roomKey: this.roomKey,
            from: this.memberId,
            to: toMemberId,
            payload: message
        }));
    }
    
    // 发送数据消息（优先通过 WebRTC 广播给所有人）
    sendData(data) {
        const messageStr = JSON.stringify(data);
        let sentCount = 0;

        Object.keys(this.rtcConnections).forEach(peerMemberId => {
            const conn = this.rtcConnections[peerMemberId];
            if (conn && conn.isOpen && conn.channel) {
                try {
                    conn.channel.send(messageStr);
                    sentCount++;
                } catch (e) {
                    console.warn('[协作] WebRTC 发送失败，回退到 WebSocket:', peerMemberId, e);
                    this.sendDataViaWebSocket(data, peerMemberId);
                }
            } else {
                // WebRTC 没连上，用 WebSocket 发送
                this.sendDataViaWebSocket(data, peerMemberId);
            }
        });

        return sentCount;
    }
    
    // 通过 WebSocket 发送数据（后备方案）
    sendDataViaWebSocket(data, toMemberId) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
        this.ws.send(JSON.stringify({
            type: 'data-relay',
            roomKey: this.roomKey,
            from: this.memberId,
            to: toMemberId,
            payload: data
        }));
    }
    
    // ========== 消息处理 ==========
    
    // 处理 WebSocket 信令消息
    handleSignalingMessage(data) {
        switch (data.type) {
            case 'room-created':
                this.emit('room-created', data);
                break;
                
            case 'room-joined':
                this.emit('room-joined', data);
                break;
                
            case 'member-joined':
                this.handleMemberJoined(data.member);
                break;
                
            case 'member-left':
                this.handleMemberLeft(data.memberId);
                break;
                
            case 'host-changed':
                this.isHost = data.isHost;
                this.emit('host-changed', data);
                break;
                
            case 'kicked':
                this.handleKicked(data);
                break;
                
            case 'error':
                console.error('[协作] 服务器错误:', data.message);
                this.emit('error', data);
                break;
                
            case 'signaling':
                // WebRTC 信令消息
                if (data.to === this.memberId) {
                    this.handleSignalingPayload(data.from, data.payload);
                }
                break;
                
            case 'data-relay':
                // WebSocket 中继的数据消息（后备）
                if (data.to === this.memberId) {
                    this.handleDataMessage(data.payload, data.from);
                }
                break;
                
            // 旧的直接消息（兼容老版本服务器，或者作为后备）
            case 'project-update':
                this.handleDataMessage(data, data.memberId || 'server');
                break;
                
            case 'blocks-update':
                this.handleDataMessage(data, data.memberId || 'server');
                break;
                
            case 'mouse-move':
                this.handleDataMessage(data, data.memberId || 'server');
                break;
                
            default:
                // 其他消息也当作数据消息处理
                this.handleDataMessage(data, data.memberId || 'server');
                break;
        }
    }
    
    // 处理 WebRTC 信令 payload
    handleSignalingPayload(fromMemberId, payload) {
        switch (payload.type) {
            case 'webrtc-offer':
                this.handleRTCOffer(fromMemberId, payload.offer);
                break;
                
            case 'webrtc-answer':
                this.handleRTCAnswer(fromMemberId, payload.answer);
                break;
                
            case 'webrtc-candidate':
                this.handleICECandidate(fromMemberId, payload.candidate);
                break;
                
            default:
                console.warn('[协作] 未知信令类型:', payload.type);
                break;
        }
    }
    
    // 处理数据消息（来自 WebRTC 或 WebSocket 后备）
    handleDataMessage(data, fromMemberId) {
        console.log('[协作] 收到数据:', data.type, '来自:', fromMemberId);
        
        if (fromMemberId === this.memberId) return; // 忽略自己的消息
        
        switch (data.type) {
            case 'project-update':
                this.handleProjectUpdate(data);
                break;
                
            case 'blocks-update':
                this.handleBlocksUpdate(data);
                break;
                
            case 'blockly-event':
                this.handleBlocklyEventMessage(data);
                break;
                
            case 'mouse-move':
                this.handleMouseMove(data);
                break;
                
            case 'chat':
                this.handleChatMessage(data, fromMemberId);
                break;
                
            case 'extensions-update':
                this.handleExtensionsUpdate(data);
                break;
                
            case 'statement-update':
                this.handleStatementUpdate(data, fromMemberId);
                break;
                
            case 'request-project':
                // 收到项目请求，只有房主才发送项目数据
                console.log('[协作] 收到项目请求，来自:', fromMemberId, '自己是否房主:', this.isHost);
                if (this.isHost && this.vm && this.isConnected) {
                    this.sendProjectUpdate(true); // 强制完整sb3
                } else {
                    console.log('[协作] 不是房主，忽略项目请求');
                }
                break;
                
            case 'member-joined':
                // 忽略，成员加入由信令处理
                break;
                
            case 'member-left':
                // 忽略，成员离开由信令处理
                break;
                
            default:
                // 转发事件
                this.emit(data.type, { ...data, fromMemberId });
                break;
        }
    }
    
    // ========== 成员管理 ==========
    
    // 处理新成员加入
    handleMemberJoined(member) {
        console.log('[协作] 新成员加入:', member.username);
        this.members.push(member);
        
        // 分配颜色
        const colorIndex = (this.members.length - 1) % this.colorPalette.length;
        this.memberColors[member.id] = this.colorPalette[colorIndex];
        
        this.emit('member-joined', member);
        this.emit('members-updated', this.members);
        
        // 如果是房主，给新成员发送扩展列表
        if (this.isHost) {
            setTimeout(() => {
                this.sendExtensionsUpdate();
            }, 500);
        }
        
        // 如果是已有的成员（比我先加入的），我已经在加入房间时发起连接了
        // 如果是新加入的成员（比我晚加入的），我需要主动发起连接
        // 但为了避免重复，我们约定：memberId 较小的一方主动发起
        // 不过简单起见，房主主动发起，或者所有人都主动发起，重复的会被忽略
        if (member.id !== this.memberId) {
            // 简单起见，每个人都主动发起，重复的 offer 会被忽略
            // 但为了避免冲突，我们让 memberId 字典序小的一方主动发起
            if (this.memberId < member.id) {
                this.initiateRTCConnection(member.id);
            }
        }
    }
    
    // 处理成员离开
    handleMemberLeft(memberId) {
        console.log('[协作] 成员离开:', memberId);
        this.members = this.members.filter(m => m.id !== memberId);
        delete this.mousePositions[memberId];
        delete this.memberColors[memberId];
        this.removeRTCConnection(memberId);
        this.emit('member-left', memberId);
        this.emit('members-updated', this.members);
    }
    
    // 处理被踢出
    handleKicked(data) {
        console.log('[协作] 被踢出房间:', data.reason);
        this._isLeavingRoom = true;
        this._stopReconnect();
        this.stopBlocksSync();
        this.stopMouseTracking();
        this.clearRoomInfo();
        this.closeAllRTCConnections();
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        this.roomKey = null;
        this.isHost = false;
        this.members = [];
        this.isConnected = false;
        this.hasReceivedProject = false;
        this.emit('kicked', data);
    }
    
    // 踢出成员（房主功能）
    kickMember(memberId, reason = '') {
        if (!this.isHost) return;
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'kick-member',
                roomKey: this.roomKey,
                memberId: memberId,
                reason: reason
            }));
        }
    }
    
    // ========== 聊天功能 ==========
    
    // 发送聊天消息
    sendChatMessage(text) {
        if (!this.isConnected || !text || !text.trim()) return;
        
        const message = {
            type: 'chat',
            text: text.trim(),
            memberId: this.memberId,
            username: this.username,
            timestamp: Date.now()
        };
        
        // 添加到本地消息列表
        this.chatMessages.push(message);
        this.emit('chat-message', message);
        
        // 发送给其他人
        this.sendData(message);
    }
    
    // 处理收到的聊天消息
    handleChatMessage(data, fromMemberId) {
        // 补充成员信息
        const member = this.members.find(m => m.id === fromMemberId);
        const message = {
            ...data,
            fromMemberId: fromMemberId,
            username: data.username || (member ? member.username : '未知用户')
        };
        
        // 添加到消息列表
        this.chatMessages.push(message);
        
        // 触发事件
        this.emit('chat-message', message);
    }
    
    // 发送扩展更新
    sendExtensionsUpdate() {
        if (!this.vm || !this.isConnected) return;
        
        try {
            const extensionManager = this.vm.extensionManager;
            if (!extensionManager || !extensionManager.getExtensionURLs) return;
            
            const extensions = extensionManager.getExtensionURLs() || {};
            
            // 计算扩展签名（用于检测变化）
            const coreExtensions = [
                'motion', 'looks', 'sound', 'events', 'control', 'sensing',
                'operators', 'variables', 'myBlocks', 'customExtension'
            ];
            const extIds = [];
            for (const extensionId of Object.keys(extensions)) {
                if (!coreExtensions.includes(extensionId)) {
                    extIds.push(extensionId);
                }
            }
            extIds.sort();
            this._lastExtensionsSignature = extIds.join(',');
            
            const message = {
                type: 'extensions-update',
                extensions: extensions,
                memberId: this.memberId
            };
            
            this.sendData(message);
            console.log('[协作] 已发送扩展更新，扩展数量:', extIds.length, extIds.join(', '));
        } catch (e) {
            console.warn('[协作] 发送扩展更新失败:', e);
        }
    }
    
    // 处理扩展更新
    handleExtensionsUpdate(data) {
        if (!data.extensions || typeof data.extensions !== 'object') return;
        
        console.log('[协作] 收到扩展更新，来自:', data.memberId, '扩展数量:', Object.keys(data.extensions).length);
        
        try {
            const extensionManager = this.vm.extensionManager;
            if (!extensionManager || !extensionManager.loadExtensionURL) return;
            
            const coreExtensions = [
                'motion', 'looks', 'sound', 'events', 'control', 'sensing',
                'operators', 'variables', 'myBlocks', 'customExtension'
            ];
            
            let loadedCount = 0;
            for (const [extensionId, extensionUrl] of Object.entries(data.extensions)) {
                // 跳过核心扩展
                if (coreExtensions.includes(extensionId)) continue;
                // 跳过已加载的扩展
                if (extensionManager.isExtensionLoaded && extensionManager.isExtensionLoaded(extensionId)) continue;
                
                console.log('[协作] 加载扩展:', extensionId, extensionUrl);
                extensionManager.loadExtensionURL(extensionUrl).catch(err => {
                    console.warn('[协作] 加载扩展失败:', extensionId, err);
                });
                loadedCount++;
            }
            
            if (loadedCount > 0) {
                console.log(`[协作] 正在加载 ${loadedCount} 个扩展`);
            }
        } catch (e) {
            console.warn('[协作] 处理扩展更新失败:', e);
        }
    }
    
    // ========== 作品声明同步 ==========
    
    // 发送作品声明更新
    sendStatementUpdate(text) {
        if (!this.isConnected) return;
        
        const message = {
            type: 'statement-update',
            text: text,
            memberId: this.memberId,
            username: this.username,
            timestamp: Date.now()
        };
        
        this.sendData(message);
        console.log('[协作] 已发送作品声明更新，长度:', text ? text.length : 0);
    }
    
    // 处理作品声明更新
    handleStatementUpdate(data, fromMemberId) {
        if (!data || typeof data.text !== 'string') return;
        if (fromMemberId === this.memberId) return; // 忽略自己的消息
        
        console.log('[协作] 收到作品声明更新，来自:', data.username || fromMemberId, '长度:', data.text.length);
        
        try {
            // 保存到 localStorage
            localStorage.setItem('projectStatement', data.text);
            
            // 触发事件，通知 UI 更新
            this.emit('statement-updated', {
                text: data.text,
                fromMemberId: fromMemberId,
                username: data.username,
                timestamp: data.timestamp
            });
        } catch (e) {
            console.warn('[协作] 处理作品声明更新失败:', e);
        }
    }
    
    // ========== 项目同步 ==========
    
    // 发送项目更新
    sendProjectUpdate(forceFull = false) {
        if (!this.isConnected || this.isLoadingProject) return;
        
        if (this.projectUpdateTimeout) {
            clearTimeout(this.projectUpdateTimeout);
        }
        
        this.projectUpdateTimeout = setTimeout(() => {
            this._doSendProjectUpdate(forceFull);
        }, this.hasResourceChange || forceFull ? 300 : 200);
    }
    
    // 实际发送项目更新
    async _doSendProjectUpdate(forceFull = false) {
        if (!this.vm || !this.isConnected || this.isLoadingProject) return;
        
        try {
            // 获取扩展 URL 列表
            let extensions = {};
            try {
                const extensionManager = this.vm.extensionManager;
                if (extensionManager && extensionManager.getExtensionURLs) {
                    extensions = extensionManager.getExtensionURLs() || {};
                }
            } catch (e) {
                console.warn('[协作] 获取扩展列表失败:', e);
            }
            
            let projectData;
            
            if (this.hasResourceChange || forceFull) {
                // 有资源变化或强制完整同步，发送完整 sb3 项目
                const sb3 = await this.vm.saveProjectSb3();
                console.log('[协作] sb3 类型:', typeof sb3, sb3.constructor?.name);
                let arrayBuffer;
                if (sb3 instanceof Blob) {
                    arrayBuffer = await sb3.arrayBuffer();
                } else if (sb3 instanceof ArrayBuffer) {
                    arrayBuffer = sb3;
                } else {
                    console.warn('[协作] 未知的 sb3 类型，尝试直接转 arrayBuffer');
                    arrayBuffer = await sb3.arrayBuffer();
                }
                console.log('[协作] sb3 数据大小:', arrayBuffer.byteLength, '字节');
                const base64 = this.arrayBufferToBase64(arrayBuffer);
                console.log('[协作] base64 长度:', base64.length);
                projectData = {
                    type: 'project-update',
                    format: 'sb3-base64',
                    data: base64,
                    memberId: this.memberId,
                    isHost: this.isHost,
                    extensions: extensions
                };
                this.hasResourceChange = false;
                this._updateResourceCounts();
            } else {
                // 没有资源变化，发送 JSON（轻量）
                const projectJson = this.vm.toJSON();
                projectData = {
                    type: 'project-update',
                    format: 'json',
                    data: projectJson,
                    memberId: this.memberId,
                    isHost: this.isHost,
                    extensions: extensions
                };
            }
            
            this.lastProjectData = projectData;
            this.sendData(projectData);
        } catch (e) {
            console.error('[协作] 发送项目更新失败:', e);
        }
    }
    
    // 处理项目更新
    async handleProjectUpdate(data) {
        if (this.isLoadingProject) {
            console.log('[协作] 正在加载项目，忽略更新');
            return;
        }

        console.log('[协作] 加载项目更新，格式:', data.format, '来自:', data.memberId);
        
        this.isLoadingProject = true;
        
        try {
            if (data.format === 'sb3-base64') {
                // 完整 sb3 项目
                console.log('[协作] 收到 sb3 base64 长度:', data.data.length);
                const arrayBuffer = this.base64ToArrayBuffer(data.data);
                console.log('[协作] 解码后 arrayBuffer 大小:', arrayBuffer.byteLength, '字节');
                try {
                    // 先尝试直接用 ArrayBuffer 加载
                    await this.vm.loadProject(arrayBuffer);
                    console.log('[协作] 已加载 sb3 项目（ArrayBuffer 方式）');
                } catch (e1) {
                    console.warn('[协作] ArrayBuffer 方式加载失败，尝试 Blob 方式:', e1);
                    try {
                        const blob = new Blob([arrayBuffer], { type: 'application/x.scratch.sb3' });
                        await this.vm.loadProject(blob);
                        console.log('[协作] 已加载 sb3 项目（Blob 方式）');
                    } catch (e2) {
                        console.error('[协作] Blob 方式也失败:', e2);
                        throw e2;
                    }
                }
            } else {
                // JSON 格式
                await this.vm.loadProject(data.data);
                console.log('[协作] 已加载 JSON 项目');
            }
            
            this._updateResourceCounts();
            
            // 加载缺失的扩展
            if (data.extensions && typeof data.extensions === 'object') {
                try {
                    const extensionManager = this.vm.extensionManager;
                    if (extensionManager && extensionManager.loadExtensionURL) {
                        const coreExtensions = [
                            'motion', 'looks', 'sound', 'events', 'control', 'sensing',
                            'operators', 'variables', 'myBlocks', 'customExtension'
                        ];
                        
                        let loadedCount = 0;
                        for (const [extensionId, extensionUrl] of Object.entries(data.extensions)) {
                            // 跳过核心扩展
                            if (coreExtensions.includes(extensionId)) continue;
                            // 跳过已加载的扩展
                            if (extensionManager.isExtensionLoaded && extensionManager.isExtensionLoaded(extensionId)) continue;
                            
                            // 加载扩展
                            console.log('[协作] 加载扩展:', extensionId, extensionUrl);
                            extensionManager.loadExtensionURL(extensionUrl).catch(err => {
                                console.warn('[协作] 加载扩展失败:', extensionId, err);
                            });
                            loadedCount++;
                        }
                        
                        if (loadedCount > 0) {
                            console.log(`[协作] 正在加载 ${loadedCount} 个扩展`);
                        }
                    }
                } catch (e) {
                    console.warn('[协作] 处理扩展同步失败:', e);
                }
            }
            
            this.emit('project-updated', data);
            this.hasReceivedProject = true;
            console.log('[协作] 项目加载完成');
        } catch (e) {
            console.error('[协作] 加载项目失败:', e);
        } finally {
            // 延迟一点再重置，避免立即触发发送
            setTimeout(() => {
                this.isLoadingProject = false;
                console.log('[协作] 项目加载标志已重置');
            }, 500);
        }
    }
    
    // ArrayBuffer 转 Base64
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    
    // Base64 转 ArrayBuffer
    base64ToArrayBuffer(base64) {
        const binary_string = atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }
    
    // ========== 积木同步 ==========
    
    // 启动积木同步
    startBlocksSync() {
        if (this.isBlocksSyncActive) return;
        
        this.isBlocksSyncActive = true;
        
        // 添加积木移动动画样式（让远程同步更流畅）
        this._addBlocksAnimationStyle();
        
        // 启动资源变化定期检测（确保变量、列表、广播等都能同步）
        this._resourceCheckInterval = setInterval(() => {
            if (!this.isConnected) return;
            
            // 检测扩展变化（单独同步，更及时）
            try {
                const extensionManager = this.vm.extensionManager;
                if (extensionManager && extensionManager.getExtensionURLs) {
                    const extensions = extensionManager.getExtensionURLs() || {};
                    const coreExtensions = [
                        'motion', 'looks', 'sound', 'events', 'control', 'sensing',
                        'operators', 'variables', 'myBlocks', 'customExtension'
                    ];
                    const extIds = [];
                    for (const extensionId of Object.keys(extensions)) {
                        if (!coreExtensions.includes(extensionId)) {
                            extIds.push(extensionId);
                        }
                    }
                    extIds.sort();
                    const currentSignature = extIds.join(',');
                    if (currentSignature !== this._lastExtensionsSignature) {
                        console.log('[协作] 检测到扩展变化（定期检测），扩展列表:', extIds.join(', ') || '无');
                        this.sendExtensionsUpdate();
                    }
                }
            } catch (e) {
                // 忽略错误
            }
            
            // 检测资源变化（触发全量同步）
            if (this._detectResourceChange()) {
                console.log('[协作] 检测到资源变化（定期检测），发送全量同步');
                this.hasResourceChange = true;
                this.sendProjectUpdate();
            }
        }, 1000);
        
        // 监听 Blockly 的 change 事件（实时增量同步）
        setTimeout(() => {
            try {
                const workspace = AddonHooks.blocklyWorkspace;
                if (workspace && workspace.addChangeListener) {
                    this._blocksChangeListener = (event) => {
                        this.handleBlocklyEvent(event);
                    };
                    workspace.addChangeListener(this._blocksChangeListener);
                    console.log('[协作] 已添加 Blockly 事件监听器（实时同步）');
                }
            } catch (e) {
                console.error('[协作] 添加 Blockly 事件监听器失败:', e);
            }
        }, 1000);
    }
    
    // 添加积木动画样式
    _addBlocksAnimationStyle() {
        if (this._blocksAnimationStyle) return;
        
        const style = document.createElement('style');
        style.textContent = `
            /* 远程积木同步动画 */
            .blocklySvg .blocklyDraggable {
                transition: transform 0.08s ease-out;
            }
        `;
        document.head.appendChild(style);
        this._blocksAnimationStyle = style;
    }
    
    // 停止积木同步
    stopBlocksSync() {
        if (!this.isBlocksSyncActive) return;
        
        this.isBlocksSyncActive = false;
        
        // 停止资源变化定期检测
        if (this._resourceCheckInterval) {
            clearInterval(this._resourceCheckInterval);
            this._resourceCheckInterval = null;
        }
        
        try {
            const workspace = AddonHooks.blocklyWorkspace;
            if (workspace && this._blocksChangeListener) {
                workspace.removeChangeListener(this._blocksChangeListener);
                this._blocksChangeListener = null;
            }
        } catch (e) {
            // 忽略
        }
    }
    
    // 工作区变化处理
    handleWorkspaceChange() {
        if (this.isApplyingRemoteEvent || this.isLoadingProject || !this.isConnected) return;
        this.sendBlocksUpdate();
    }
    
    // 发送积木更新
    sendBlocksUpdate() {
        if (!this.vm || !this.isConnected || this.isLoadingProject) return;
        
        try {
            const target = this.vm.editingTarget;
            if (!target) return;
            
            const targetId = target.id;
            const spriteName = target.sprite.name;
            const blocksData = target.blocks._blocks;
            
            // 内容比较，避免重复发送
            const blocksStr = JSON.stringify(blocksData);
            if (blocksStr === this._lastBlocksData && targetId === this._lastBlocksTargetId) {
                return;
            }
            
            this._lastBlocksData = blocksStr;
            this._lastBlocksTargetId = targetId;
            
            // 尝试获取 Blockly XML（用于直接更新对方的工作区显示）
            let blocksXml = null;
            try {
                const workspace = AddonHooks.blocklyWorkspace;
                if (workspace && window.ScratchBlocks) {
                    const xml = window.ScratchBlocks.Xml.workspaceToDom(workspace);
                    blocksXml = window.ScratchBlocks.Xml.domToText(xml);
                }
            } catch (e) {
                // 忽略，没有 XML 也能用 JSON 更新 VM 数据
            }
            
            const message = {
                type: 'blocks-update',
                targetId: targetId,
                spriteName: spriteName,
                blocks: blocksData,
                blocksXml: blocksXml, // 新增：积木的 XML 格式，用于直接刷新工作区
                memberId: this.memberId
            };
            
            this.sendData(message);
        } catch (e) {
            console.error('[协作] 发送积木更新失败:', e);
        }
    }
    
    // 处理积木更新
    handleBlocksUpdate(data) {
        if (this.isLoadingProject) return;
        
        console.log('[协作] 应用积木更新:', data.targetId, '角色名:', data.spriteName, '积木数量:', Object.keys(data.blocks || {}).length);
        
        this.isApplyingRemoteEvent = true;
        
        try {
            // 找到对应的 target：先按 ID 找，找不到再按名称找
            let target = this.vm.runtime.getTargetById(data.targetId);
            
            if (!target && data.spriteName) {
                // 按名称查找
                target = this.vm.runtime.targets.find(t => 
                    t.sprite && t.sprite.name === data.spriteName
                );
                if (target) {
                    console.log('[协作] 按名称找到角色:', data.spriteName, 'ID:', target.id);
                }
            }
            
            if (!target) {
                console.warn('[协作] 找不到目标角色:', data.targetId, '名称:', data.spriteName);
                // 调试：打印所有角色
                const allTargets = this.vm.runtime.targets.map(t => `${t.id} (${t.sprite?.name || 'stage'})`);
                console.log('[协作] 当前所有角色:', allTargets);
                return;
            }
            
            // 如果是当前编辑的角色，并且有 XML，直接加载到工作区（最可靠的方式）
            if (this.vm.editingTarget && (this.vm.editingTarget.id === target.id) && data.blocksXml) {
                console.log('[协作] 直接加载 XML 到工作区，XML长度:', data.blocksXml.length);
                try {
                    const workspace = AddonHooks.blocklyWorkspace;
                    if (workspace && window.ScratchBlocks) {
                        const dom = window.ScratchBlocks.Xml.textToDom(data.blocksXml);
                        window.ScratchBlocks.Xml.clearWorkspaceAndLoadFromXml(dom, workspace);
                        console.log('[协作] ✅ 已通过 XML 刷新工作区显示');
                        // 加载 XML 后，VM 会自动更新数据和缓存，不需要再手动更新 _blocks
                        this.emit('blocks-updated', data);
                        return; // 直接返回，不再走下面的 _blocks 更新逻辑
                    }
                } catch (e) {
                    console.error('[协作] 加载 XML 到工作区失败:', e);
                    // 失败了就回退到 _blocks 更新方式
                }
            }
            
            // 更新 VM 中的积木数据（用于非当前编辑的角色，或者 XML 加载失败时）
            if (target.blocks && target.blocks._blocks) {
                // 不替换整个对象，而是修改原对象的内容
                // 这样 VM 内部其他引用还能看到新数据
                const blocks = target.blocks._blocks;
                
                // 清空旧积木
                for (const key in blocks) {
                    if (Object.prototype.hasOwnProperty.call(blocks, key)) {
                        delete blocks[key];
                    }
                }
                
                // 复制新积木
                Object.assign(blocks, data.blocks);
                
                console.log('[协作] 已更新 VM 中的积木数据，积木数量:', Object.keys(blocks).length);
                
                // 清空运行时缓存
                if (target.blocks._cache) {
                    target.blocks._cache = {};
                    console.log('[协作] 已清空 target.blocks._cache');
                }
                if (target.blocks._scripts) {
                    target.blocks._scripts = [];
                    console.log('[协作] 已清空 target.blocks._scripts');
                }
            }
            
            // 如果是当前编辑的角色，尝试刷新工作区显示（XML方式失败才会走到这里）
            if (this.vm.editingTarget && (this.vm.editingTarget.id === target.id)) {
                console.log('[协作] 尝试用 vm.refreshWorkspace 刷新显示');
                
                // 调试：监听 workspaceUpdate 事件
                const handler = (data) => {
                    console.log('[协作] ✅ workspaceUpdate 事件触发，xml长度:', data.xml.length);
                };
                this.vm.on('workspaceUpdate', handler);
                
                try {
                    if (typeof this.vm.refreshWorkspace === 'function') {
                        this.vm.refreshWorkspace();
                    }
                } catch (e) {
                    console.error('[协作] 刷新工作区失败:', e);
                }
                
                // 2秒后移除监听器
                setTimeout(() => {
                    this.vm.off('workspaceUpdate', handler);
                }, 2000);
            }
            
            this.emit('blocks-updated', data);
        } catch (e) {
            console.error('[协作] 应用积木更新失败:', e);
        } finally {
            // 立即恢复，避免阻塞用户操作
            // 事件应用是同步的，此时衍生事件已经全部触发完毕
            this.isApplyingRemoteEvent = false;
        }
    }
    
    // 处理本地 Blockly 事件（发送给对方）
    handleBlocklyEvent(event) {
        if (this.isApplyingRemoteEvent || this.isLoadingProject || !this.isConnected) return;
        
        // 过滤掉纯 UI 事件（滚动、缩放、选中变化等）
        if (event.type === 'ui') {
            return;
        }
        
        // 对 move 事件进行节流（每 16ms 一次，约 60fps，保证流畅又不占太多带宽）
        if (event.type === 'move') {
            const now = Date.now();
            if (now - this._lastMoveEventSendTime < 16) {
                return;
            }
            this._lastMoveEventSendTime = now;
        }
        
        try {
            // 序列化事件
            let eventJson;
            if (event.toJson) {
                eventJson = event.toJson();
            } else {
                // 降级：手动提取关键属性
                eventJson = JSON.parse(JSON.stringify(event));
            }
            
            const message = {
                type: 'blockly-event',
                event: eventJson,
                targetId: this.vm.editingTarget?.id,
                spriteName: this.vm.editingTarget?.sprite?.name,
                memberId: this.memberId
            };
            
            this.sendData(message);
        } catch (e) {
            console.error('[协作] 发送 Blockly 事件失败:', e);
        }
    }
    
    // 处理收到的远程 Blockly 事件（应用到本地）
    handleBlocklyEventMessage(data) {
        if (this.isLoadingProject) {
            return;
        }
        
        // 检查是否是当前编辑的角色
        if (this.vm.editingTarget) {
            const targetIdMatch = data.targetId && this.vm.editingTarget.id === data.targetId;
            const spriteNameMatch = data.spriteName && this.vm.editingTarget.sprite?.name === data.spriteName;
            
            if (!targetIdMatch && !spriteNameMatch) {
                // 不是当前编辑的角色，忽略事件（等切换到该角色时会全量同步）
                return;
            }
        }
        
        this.isApplyingRemoteEvent = true;
        
        try {
            const workspace = AddonHooks.blocklyWorkspace;
            if (!workspace) {
                console.warn('[协作] 找不到 Blockly 工作区');
                return;
            }
            
            // 反序列化事件
            let event;
            try {
                // 优先尝试 ScratchBlocks（Scratch 实际使用的）
                const ScratchBlocks = window.ScratchBlocks;
                const Blockly = window.Blockly;
                const Events = (ScratchBlocks?.Events) || (Blockly?.Events);
                
                // 1. 先尝试原生的 fromJson 静态方法
                if (Events?.fromJson) {
                    event = Events.fromJson(data.event, workspace);
                }
                // 2. 自己实现 fromJson（Scratch Blocks dist 版本没导出静态方法）
                else if (Events) {
                    // 事件类型映射
                    const eventTypeMap = {
                        'create': 'Create',
                        'delete': 'Delete',
                        'change': 'Change',
                        'move': 'Move',
                        'var_create': 'VarCreate',
                        'var_delete': 'VarDelete',
                        'var_rename': 'VarRename',
                        'comment_create': 'CommentCreate',
                        'comment_change': 'CommentChange',
                        'comment_move': 'CommentMove',
                        'comment_delete': 'CommentDelete',
                        'ui': 'Ui',
                        'dragOutside': 'DragBlockOutside',
                        'endDrag': 'EndBlockDrag'
                    };
                    
                    const className = eventTypeMap[data.event.type];
                    if (className && Events[className]) {
                        // 创建事件实例（传入 null 创建空事件，等待 fromJson 填充）
                        event = new Events[className](null);
                        // 调用实例的 fromJson 方法填充数据
                        if (event.fromJson) {
                            event.fromJson(data.event);
                        }
                        // 设置工作区 ID
                        event.workspaceId = workspace.id;
                    } else {
                        console.warn('[协作] 未知事件类型或类不存在:', data.event.type, className);
                    }
                }
            } catch (e) {
                console.warn('[协作] 事件反序列化失败:', e);
            }
            
            // 应用事件
            if (event) {
                if (event.run) {
                    event.run(true);
                } else if (workspace.dispatchEvent) {
                    workspace.dispatchEvent(event);
                }
            } else {
                console.warn('[协作] 无法创建事件对象，跳过应用');
            }
            
            this.emit('blockly-event-applied', data);
        } catch (e) {
            console.error('[协作] 应用远程 Blockly 事件失败:', e);
            // 失败时回退到全量同步请求
            console.log('[协作] 事件应用失败，请求全量同步');
            this.requestProject();
        } finally {
            setTimeout(() => {
                this.isApplyingRemoteEvent = false;
            }, 30);
        }
    }
    
    // ========== 鼠标同步 ==========
    
    // 启动鼠标跟踪
    startMouseTracking() {
        // 由 collaboration-cursor 组件调用 sendMousePosition
    }
    
    // 停止鼠标跟踪
    stopMouseTracking() {
        // 由 collaboration-cursor 组件处理
    }
    
    // 发送鼠标位置
    sendMousePosition(x, y) {
        if (!this.isConnected) return;
        
        const now = Date.now();
        if (now - this._lastMouseSendTime < this.mouseThrottleTime) {
            return;
        }
        this._lastMouseSendTime = now;
        
        const message = {
            type: 'mouse-move',
            x: x,
            y: y,
            memberId: this.memberId,
            username: this.username
        };
        
        this.sendData(message);
    }
    
    // 处理鼠标移动
    handleMouseMove(data) {
        const memberId = data.memberId;
        if (!memberId) return;
        
        const color = this.memberColors[memberId] || '#FF6B6B';
        
        this.mousePositions[memberId] = {
            x: data.x,
            y: data.y,
            color: color,
            username: data.username || '用户'
        };
        
        this.emit('mouse-move', { memberId, ...this.mousePositions[memberId] });
    }
    
    // ========== VM 监听器 ==========
    
    setupVMListeners() {
        if (!this.vm) return;
        
        // 监听目标变化事件（添加/删除角色、造型、声音、变量等都会触发）
        // 检测到资源数量变化时发送完整项目同步
        // 积木变化通过专门的 Blockly 事件增量同步
        try {
            this.vm.on('TARGETS_UPDATE', () => {
                if (this.isConnected && this._detectResourceChange()) {
                    console.log('[协作] 检测到资源变化（TARGETS_UPDATE），发送全量同步');
                    this.hasResourceChange = true;
                    this.sendProjectUpdate();
                }
            });
        } catch (e) {
            console.error('[协作] 监听 TARGETS_UPDATE 事件失败:', e);
        }
        
        // 监听项目变化事件（造型内容修改等也会触发），用防抖避免频繁触发
        let projectChangeTimeout = null;
        try {
            this.vm.on('PROJECT_CHANGED', () => {
                if (!this.isConnected || this.isLoadingProject) return;
                
                // 防抖：300ms 内多次触发只检测一次
                if (projectChangeTimeout) {
                    clearTimeout(projectChangeTimeout);
                }
                projectChangeTimeout = setTimeout(() => {
                    if (this._detectResourceChange()) {
                        console.log('[协作] 检测到资源变化（PROJECT_CHANGED），发送全量同步');
                        this.hasResourceChange = true;
                        this.sendProjectUpdate();
                    }
                }, 300);
            });
        } catch (e) {
            console.error('[协作] 监听 PROJECT_CHANGED 事件失败:', e);
        }
        
        // 初始化资源数量
        this._updateResourceCounts();
    }
    
    // 更新资源数量记录
    _updateResourceCounts() {
        if (!this.vm || !this.vm.runtime) return;
        
        const targets = this.vm.runtime.targets;
        let spriteCount = 0;
        let totalCostumes = 0;
        let totalSounds = 0;
        let totalVariables = 0;
        let totalLists = 0;
        let totalBroadcasts = 0;
        let costumesSignature = ''; // 造型签名，用于检测内容变化
        let soundsSignature = ''; // 声音签名
        let extensionsSignature = ''; // 扩展签名
        
        targets.forEach(target => {
            if (target.isOriginal) {
                spriteCount++;
                if (target.sprite && target.sprite.costumes) {
                    totalCostumes += target.sprite.costumes.length;
                    // 生成造型签名（角色名 + 造型名 + md5ext）
                    target.sprite.costumes.forEach(costume => {
                        costumesSignature += `${target.getName()}:${costume.name}:${costume.md5ext || costume.assetId || ''};`;
                    });
                }
                if (target.sprite && target.sprite.sounds) {
                    totalSounds += target.sprite.sounds.length;
                    // 生成声音签名
                    target.sprite.sounds.forEach(sound => {
                        soundsSignature += `${target.getName()}:${sound.name}:${sound.md5ext || sound.assetId || ''};`;
                    });
                }
                // 统计变量、列表、广播
                if (target.variables) {
                    Object.values(target.variables).forEach(variable => {
                        if (variable.type === '' || variable.type === 'variable') {
                            totalVariables++;
                        } else if (variable.type === 'list') {
                            totalLists++;
                        } else if (variable.type === 'broadcast_msg') {
                            totalBroadcasts++;
                        }
                    });
                }
            }
        });
        
        // 生成扩展签名（排除核心扩展）
        try {
            const extensionManager = this.vm.extensionManager;
            if (extensionManager && extensionManager.getExtensionURLs) {
                const extensions = extensionManager.getExtensionURLs() || {};
                const coreExtensions = [
                    'motion', 'looks', 'sound', 'events', 'control', 'sensing',
                    'operators', 'variables', 'myBlocks', 'customExtension'
                ];
                const extIds = [];
                for (const extensionId of Object.keys(extensions)) {
                    if (!coreExtensions.includes(extensionId)) {
                        extIds.push(extensionId);
                    }
                }
                extIds.sort();
                extensionsSignature = extIds.join(',');
            }
        } catch (e) {
            // 忽略错误
        }
        
        this._lastSpriteCount = spriteCount;
        this._lastTotalCostumes = totalCostumes;
        this._lastTotalSounds = totalSounds;
        this._lastTotalVariables = totalVariables;
        this._lastTotalLists = totalLists;
        this._lastTotalBroadcasts = totalBroadcasts;
        this._lastCostumesSignature = costumesSignature;
        this._lastSoundsSignature = soundsSignature;
        this._lastExtensionsSignature = extensionsSignature;
    }
    
    // 检测资源是否有变化
    _detectResourceChange() {
        if (!this.vm || !this.vm.runtime) return false;
        
        const targets = this.vm.runtime.targets;
        let spriteCount = 0;
        let totalCostumes = 0;
        let totalSounds = 0;
        let totalVariables = 0;
        let totalLists = 0;
        let totalBroadcasts = 0;
        let costumesSignature = '';
        let soundsSignature = '';
        let extensionsSignature = '';
        
        targets.forEach(target => {
            if (target.isOriginal) {
                spriteCount++;
                if (target.sprite && target.sprite.costumes) {
                    totalCostumes += target.sprite.costumes.length;
                    target.sprite.costumes.forEach(costume => {
                        costumesSignature += `${target.getName()}:${costume.name}:${costume.md5ext || costume.assetId || ''};`;
                    });
                }
                if (target.sprite && target.sprite.sounds) {
                    totalSounds += target.sprite.sounds.length;
                    target.sprite.sounds.forEach(sound => {
                        soundsSignature += `${target.getName()}:${sound.name}:${sound.md5ext || sound.assetId || ''};`;
                    });
                }
                if (target.variables) {
                    Object.values(target.variables).forEach(variable => {
                        if (variable.type === '' || variable.type === 'variable') {
                            totalVariables++;
                        } else if (variable.type === 'list') {
                            totalLists++;
                        } else if (variable.type === 'broadcast_msg') {
                            totalBroadcasts++;
                        }
                    });
                }
            }
        });
        
        // 计算扩展签名
        try {
            const extensionManager = this.vm.extensionManager;
            if (extensionManager && extensionManager.getExtensionURLs) {
                const extensions = extensionManager.getExtensionURLs() || {};
                const coreExtensions = [
                    'motion', 'looks', 'sound', 'events', 'control', 'sensing',
                    'operators', 'variables', 'myBlocks', 'customExtension'
                ];
                const extIds = [];
                for (const extensionId of Object.keys(extensions)) {
                    if (!coreExtensions.includes(extensionId)) {
                        extIds.push(extensionId);
                    }
                }
                extIds.sort();
                extensionsSignature = extIds.join(',');
            }
        } catch (e) {
            // 忽略错误
        }
        
        if (spriteCount !== this._lastSpriteCount ||
            totalCostumes !== this._lastTotalCostumes ||
            totalSounds !== this._lastTotalSounds ||
            totalVariables !== this._lastTotalVariables ||
            totalLists !== this._lastTotalLists ||
            totalBroadcasts !== this._lastTotalBroadcasts ||
            costumesSignature !== this._lastCostumesSignature ||
            soundsSignature !== this._lastSoundsSignature ||
            extensionsSignature !== this._lastExtensionsSignature) {
            return true;
        }
        
        return false;
    }
    
    // ========== 聊天功能 ==========
    
    // 发送聊天消息
    sendChatMessage(text) {
        if (!this.isConnected || !text || !text.trim()) return;
        
        const message = {
            type: 'chat',
            text: text.trim(),
            memberId: this.memberId,
            username: this.username,
            timestamp: Date.now()
        };
        
        this.sendData(message);
        
        // 自己也触发一下，方便UI显示
        this.emit('chat-message', {
            ...message,
            fromMemberId: this.memberId,
            isSelf: true
        });
    }
    
    // 处理收到的聊天消息
    handleChatMessage(data, fromMemberId) {
        console.log('[协作] 收到聊天消息:', data.username, data.text);
        
        this.emit('chat-message', {
            ...data,
            fromMemberId: fromMemberId,
            isSelf: false
        });
    }
}

// 单例模式
const collaborationManager = new CollaborationManager();

export default collaborationManager;
