/**
 * 多端协作管理器
 * 基于 PeerJS 的 P2P 协作实现，参考 02engine/scratch-gui。
 *
 * 通过相同的房间号，可以与 mw、bilup、02e、rw 等支持该协议的编辑器互联。
 * 房间号是唯一的会合标识：主机注册 `${PREFIX}-collab-${roomId}-host`，
 * 客户端拨号到该 ID。为保持与上述编辑器的互操作兼容性，PREFIX 使用
 * 与它们一致的值。
 */
import Peer from 'peerjs';

// 与 mw / bilup / 02e / rw 等编辑器保持一致的 peer ID 前缀。
// 这些编辑器在生成 peer ID 时使用了未定义的 APPNAME 常量，
// 因此实际前缀为字面量 "undefined"。此处刻意保持一致以实现互操作。
const APP_PREFIX = 'undefined';

// PeerJS 信令服务器配置（与 02engine / bilup 一致）
const PEER_CONFIG = {
    host: 'collab.bilup.org',
    key: 'bilup',
    port: 443,
    path: '/',
    secure: true,
    config: {
        iceServers: [
            {urls: 'stun:vpn.mikedev101.cc:5349'},
            {urls: 'turn:vpn.mikedev101.cc:5349', username: 'free', credential: 'free'},
            {urls: 'stun:stun.l.google.com:19302'},
            {urls: 'stun:freeturn.net:3478'},
            {urls: 'stun:freeturn.net:5349'},
            {urls: 'turn:freeturn.net:3478', username: 'free', credential: 'free'},
            {urls: 'turns:freeturn.net:5349', username: 'free', credential: 'free'}
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all'
    },
    debug: 2
};

// 房间号生成用词表（与 02engine 一致）
const ADJECTIVES = ['cool', 'fun', 'epic', 'wild', 'neat', 'rad', 'hot', 'ice', 'big', 'tiny'];
const NOUNS = ['cat', 'dog', 'owl', 'fox', 'bee', 'ant', 'fish', 'bird', 'frog', 'duck'];

class MultiCollaborationManager {
    constructor () {
        this.peer = null;
        this.connections = new Map();
        this.users = new Map();
        this.eventListeners = new Map();

        this.roomId = null;
        this.username = null;
        this.isHost = false;
        this.isConnected = false;
        this.isConnectedToHost = false;
        this.hostId = null;
        this.memberId = null;
        this.isDisconnecting = false;
        this.connectionTimeout = null;
        this.wasKicked = false;

        this._reconnectTimer = null;
        this._reconnectionState = null;
        this.currentConnectionFailureHandler = null;
    }

    // --- 事件系统 ---
    on (event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    off (event, callback) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    emit (event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    // 忽略回调异常
                }
            });
        }
    }

    // --- Peer ID 生成（与 02engine 等编辑器一致） ---
    generatePeerId (roomId, isHost = false) {
        if (!roomId) {
            throw new Error('roomId is required for generatePeerId');
        }
        const sanitizedRoomId = roomId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (isHost) {
            return `${APP_PREFIX}-collab-${sanitizedRoomId}-host`;
        }
        const timestamp = Date.now();
        const randomString = Math.random().toString(36)
            .substring(2, 11);
        return `${APP_PREFIX}-collab-${sanitizedRoomId}-user-${timestamp}-${randomString}`;
    }

    // --- 房间号生成 ---
    generateRoomCode () {
        const randomAdjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
        const randomNoun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
        const randomNum = Math.floor(Math.random() * 1000).toString()
            .padStart(3, '0');
        return `${randomAdjective}-${randomNoun}-${randomNum}`;
    }

    setUsername (username) {
        this.username = username || `User${Math.floor(Math.random() * 1000)}`;
    }

    // --- 创建房间（作为主机） ---
    createRoom (roomId, username) {
        const code = roomId || this.generateRoomCode();
        this.username = username || `User${Math.floor(Math.random() * 1000)}`;
        this.roomId = code;
        this.isHost = true;

        const peerId = this.generatePeerId(code, true);

        return new Promise((resolve, reject) => {
            try {
                this.peer = new Peer(peerId, PEER_CONFIG);
            } catch (error) {
                reject(error);
                return;
            }

            this.peer.on('open', id => {
                this.memberId = id;
                this.isConnected = true;
                this.isConnectedToHost = true;
                this.hostId = id;

                const hostUser = {
                    id: id,
                    username: this.username,
                    isHost: true
                };
                this.users.set(id, hostUser);

                this.emit('connected', {roomId: code, isHost: true});
                this.emit('members-updated', Array.from(this.users.values()));

                resolve({
                    roomKey: code,
                    isHost: true,
                    members: Array.from(this.users.values())
                });
            });

            this.peer.on('connection', conn => {
                this.handleConnection(conn);
            });

            this.peer.on('error', error => {
                if (this.isDisconnecting) return;
                const errorMessage = error.message || error.toString();
                if (errorMessage.includes('taken') || errorMessage.includes('unavailable') ||
                    errorMessage.includes('server') || errorMessage.includes('network')) {
                    this.emit('error', {message: `无法创建房间: ${errorMessage}`});
                    reject(error);
                } else {
                    // 非致命错误，仅记录
                    console.warn('[MultiCollab] Non-critical peer error:', error);
                }
            });
        });
    }

    // --- 加入房间（作为客户端） ---
    joinRoom (roomId, username) {
        if (!roomId || !roomId.trim()) {
            throw new Error('请输入房间号');
        }
        this.username = username || `User${Math.floor(Math.random() * 1000)}`;
        this.roomId = roomId.trim();
        this.isHost = false;

        const peerId = this.generatePeerId(this.roomId, false);

        return new Promise((resolve, reject) => {
            try {
                this.peer = new Peer(peerId, PEER_CONFIG);
            } catch (error) {
                reject(error);
                return;
            }

            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    this.emit('error', {message: `连接房间 "${this.roomId}" 超时，主机可能不在线`});
                    this.disconnect();
                    reject(new Error(`连接房间 "${this.roomId}" 超时`));
                }
            }, 15000);
            this.connectionTimeout = timeout;

            this.peer.on('open', id => {
                this.memberId = id;
                this.isConnected = true;
                this.connectToHost(resolve, reject);
            });

            this.peer.on('error', error => {
                if (this.isDisconnecting || resolved) return;
                resolved = true;
                if (this.connectionTimeout) {
                    clearTimeout(this.connectionTimeout);
                    this.connectionTimeout = null;
                }
                this.emit('error', {
                    message: `无法连接到房间 "${this.roomId}"，主机可能不在线或房间不存在`
                });
                this.disconnect();
                reject(error);
            });
        });
    }

    // --- 客户端连接到主机 ---
    connectToHost (resolve, reject) {
        const hostId = this.generatePeerId(this.roomId, true);
        this.hostId = hostId;

        let resolved = false;
        const finishResolve = success => {
            if (resolved) return;
            resolved = true;
            if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = null;
            }
            if (success) {
                resolve({
                    roomKey: this.roomId,
                    isHost: false,
                    members: Array.from(this.users.values())
                });
            }
        };

        try {
            const conn = this.peer.connect(hostId, {
                label: 'collaboration',
                metadata: {
                    username: this.username,
                    roomId: this.roomId
                },
                reliable: true
            });

            conn.on('open', () => {
                this.isConnectedToHost = true;
                this.emit('connected', {roomId: this.roomId, isHost: false});
                // 向主机发送加入信息
                this.sendMessage('user-join', {
                    id: this.peer.id,
                    username: this.username,
                    isHost: false
                }, conn);
                finishResolve(true);
            });

            conn.on('data', data => {
                this.handleMessage(data, conn);
            });

            conn.on('close', () => {
                this.connections.delete(conn.peer);
                if (conn.peer === this.hostId && !this.isHost) {
                    this.emit('error', {message: '主机已断开连接'});
                    this.emit('disconnected');
                    this.resetState();
                }
            });

            conn.on('error', () => {
                if (!resolved) {
                    finishResolve(false);
                    this.emit('error', {
                        message: `无法连接到主机。房间 "${this.roomId}" 可能不存在或主机不在线。`
                    });
                    this.disconnect();
                    reject(new Error('无法连接到主机'));
                }
            });

            this.connections.set(hostId, conn);
        } catch (error) {
            finishResolve(false);
            this.emit('error', {message: `连接房间失败: ${error.message}`});
            this.disconnect();
            reject(error);
        }
    }

    // --- 处理传入连接（主机端） ---
    handleConnection (conn) {
        this.connections.set(conn.peer, conn);

        conn.on('open', () => {
            // 等待客户端发送 user-join 消息
        });

        conn.on('data', data => {
            this.handleMessage(data, conn);
        });

        conn.on('close', () => {
            const userInfo = this.users.get(conn.peer);
            this.connections.delete(conn.peer);
            this.users.delete(conn.peer);
            if (!this.wasKicked && userInfo) {
                this.emit('members-updated', Array.from(this.users.values()));
            }
        });

        conn.on('error', () => {
            this.connections.delete(conn.peer);
            this.users.delete(conn.peer);
            this.emit('members-updated', Array.from(this.users.values()));
        });
    }

    // --- 消息处理 ---
    handleMessage (data, conn) {
        const {type, payload} = data;
        switch (type) {
        case 'user-join':
            this.handleUserJoin(payload, conn);
            break;
        case 'users-list':
            this.handleUsersList(payload);
            break;
        case 'user-leave':
            this.handleUserLeave(payload);
            break;
        case 'kick-user':
            this.handleKickUser(payload);
            break;
        default:
            break;
        }
    }

    handleUserJoin (payload, conn) {
        if (!this.isHost) return;
        // 添加用户
        const userPayload = {
            id: payload.id,
            username: payload.username,
            isHost: false
        };
        this.users.set(payload.id, userPayload);

        // 向新用户发送完整用户列表
        this.sendMessage('users-list', {
            users: Array.from(this.users.values())
        }, conn);

        // 向其他客户端广播新用户加入
        this.connections.forEach(connection => {
            if (connection.peer !== payload.id && connection.open) {
                this.sendMessage('user-join', userPayload, connection);
            }
        });

        this.emit('members-updated', Array.from(this.users.values()));
    }

    handleUsersList (payload) {
        this.users.clear();
        if (payload.users) {
            payload.users.forEach(user => {
                this.users.set(user.id, user);
            });
        }
        this.emit('members-updated', Array.from(this.users.values()));
    }

    handleUserLeave (payload) {
        this.users.delete(payload.id);
        this.emit('members-updated', Array.from(this.users.values()));
    }

    handleKickUser (payload) {
        if (payload.targetId === this.memberId) {
            this.wasKicked = true;
            this.emit('kicked', {reason: '你被移出了房间'});
            this.disconnect();
        }
    }

    // --- 发送消息 ---
    sendMessage (type, payload, targetConn = null) {
        if (!this.peer) return;
        const message = {type, payload, sender: this.peer.id, timestamp: Date.now()};

        if (targetConn) {
            const conn = typeof targetConn === 'string' ?
                this.connections.get(targetConn) :
                targetConn;
            if (conn && conn.open) {
                try {
                    conn.send(message);
                } catch (e) {
                    // 忽略发送失败
                }
            }
            return;
        }

        this.connections.forEach(conn => {
            if (conn.open) {
                try {
                    conn.send(message);
                } catch (e) {
                    // 忽略发送失败
                }
            }
        });
    }

    // --- 踢出成员（仅主机） ---
    kickMember (memberId) {
        if (!this.isHost) return;
        this.sendMessage('kick-user', {targetId: memberId});
        const conn = this.connections.get(memberId);
        if (conn) {
            try {
                conn.close();
            } catch (e) {
                // 忽略
            }
        }
        this.connections.delete(memberId);
        this.users.delete(memberId);
        this.emit('members-updated', Array.from(this.users.values()));
    }

    // --- 离开房间 ---
    leaveRoom () {
        this.disconnect();
    }

    resetState () {
        this.connections.clear();
        this.users.clear();
        this.isConnected = false;
        this.isConnectedToHost = false;
        this.isHost = false;
        this.roomId = null;
        this.hostId = null;
        this.memberId = null;
        this.wasKicked = false;
    }

    disconnect () {
        if (this.isDisconnecting) return;
        this.isDisconnecting = true;

        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }

        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        this._reconnectionState = null;

        // 通知主机/客户端离开
        if (this.isConnected && !this.isHost && this.hostId) {
            this.sendMessage('user-leave', {id: this.memberId});
        }

        this.connections.forEach(conn => {
            try {
                if (conn && conn.close) conn.close();
            } catch (e) {
                // 忽略
            }
        });

        if (this.peer && !this.peer.destroyed && this.peer.destroy) {
            try {
                this.peer.destroy();
            } catch (e) {
                // 忽略
            }
        }
        this.peer = null;

        this.resetState();
        this.isDisconnecting = false;
        this.emit('disconnected');
    }

    // --- 获取当前成员列表 ---
    get members () {
        return Array.from(this.users.values());
    }
}

// 单例导出
const multiCollaborationManager = new MultiCollaborationManager();
export default multiCollaborationManager;
