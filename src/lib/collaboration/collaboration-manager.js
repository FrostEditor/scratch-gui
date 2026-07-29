/* eslint-disable */
// 多人协作管理器 - PeerJS P2P 版本（完全重写）
//
// 设计要点：
// - 传输：PeerJS（信令走 PeerJS broker，数据走浏览器间 P2P DataConnection，业务服务器只做信令）。
// - 拓扑：星型 + host 中继。房主注册固定 peer id `${PREFIX}-collab-${roomKey}-host`，
//   其他成员拨号到该 id；房主负责把广播类消息转发给其余成员，数据不经任何业务服务器。
// - 协议：JSON 信封 { t: <类型>, f: <发送者 memberId>, p: <负载> }。
// - 同步：项目以 `vm.toJSON()/fromJSON()` 快照同步（加入时下发初始项目，编辑时防抖快照广播）；
//   光标/聊天/扩展/标签/作品声明/脑图 均为轻量广播消息。
// - 公开接口（属性 / 方法 / 事件）与旧实现保持一致，确保协作光标、聊天、菜单栏、作品声明等消费者无感切换。

import 'peerjs';

// 重要：peerjs 的发布产物 peerjs.min.js 是 esbuild IIFE 格式，不会设置 module.exports，
// 只在浏览器全局挂载 window.Peer。因此这里从 window.Peer 读取构造器，而不是用
// `import Peer from 'peerjs'`（其默认导出会是 undefined，导致 new Peer() 报 "is not a constructor"）。
const Peer = (typeof window !== 'undefined' && window.Peer) || null;

function requirePeer () {
    if (!Peer) {
        throw new Error('PeerJS 未正确加载：请确认构建把 peerjs 解析到了 ES5 版本（peerjs.min.js）');
    }
    return Peer;
}

// peer id 前缀（自定协议，不再兼容 bilup/mw/02e/rw）
const APP_PREFIX = 'froste';
// 单条消息超过该长度（字符）则分片传输
const CHUNK_THRESHOLD = 16000;
const CHUNK_TIMEOUT = 30000;
// 本地编辑 -> 广播快照的防抖时间（ms）
const SNAPSHOT_DEBOUNCE = 400;

function sanitizeRoom (room) {
    return String(room || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}
function hostPeerId (room) {
    return `${APP_PREFIX}-collab-${sanitizeRoom(room)}-host`;
}
function clientPeerId (room) {
    return `${APP_PREFIX}-collab-${sanitizeRoom(room)}-${Math.random().toString(36).substr(2, 11)}`;
}
function randId () {
    return 'm_' + Math.random().toString(36).substr(2, 9);
}
function genRoomKey () {
    const words = ['cool', 'fun', 'epic', 'wild', 'neat', 'rad', 'ice', 'big', 'tiny', 'lucky'];
    const nouns = ['cat', 'dog', 'owl', 'fox', 'bee', 'ant', 'fish', 'bird', 'frog', 'duck'];
    const a = words[Math.floor(Math.random() * words.length)];
    const b = nouns[Math.floor(Math.random() * nouns.length)];
    const n = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${a}-${b}-${n}`.toUpperCase();
}

// 需要通过 host 中继的广播类消息类型
const RELAY_TYPES = new Set([
    'cursor', 'chat', 'project-update', 'extension-update', 'extension-unload',
    'tab', 'statement', 'mindmap', 'block-event'
]);

class CollaborationManager {
    constructor () {
        this.peer = null;
        this.conn = null;            // 客户端 -> 房主连接
        this.peerConns = new Map();  // host: memberId -> DataConnection
        this.ws = null;              // 占位（保持旧接口兼容，始终为 null）
        this.serverUrl = null;
        this.serverType = 'peerjs';

        this.roomKey = null;
        this.memberId = null;
        this.isHost = false;
        this.hostToken = null;
        this.username = '用户';
        this.vm = null;

        this.isConnected = false;
        this.isConnecting = false;
        this._isLeavingRoom = false;

        this.members = [];           // [{id, username, isHost, color}]
        this.memberPermissions = {}; // memberId -> { canEdit }
        this.canEdit = true;
        this.hasReceivedProject = false;

        this.listeners = {};
        this.mousePositions = {};    // memberId -> {x, y, color, username}
        this.memberColors = {};
        this.memberTabs = {};        // memberId -> tab
        this.currentTab = 'code';
        this.chatMessages = [];

        this.colorPalette = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#F38181',
            '#AA96DA', '#FCBAD3', '#A8D8EA', '#FF9F68', '#6A8EAE'];
        this._colorIndex = 0;

        this._pendingChunks = {};
        this._chunkTimeouts = {};
        this._snapshotTimer = null;
        this._isApplyingRemote = false;
        this._vmListenersBound = false;
        this._lastMouseSendTime = 0;
    }

    // ========== 事件系统 ==========
    on (event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }
    off (event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
    emit (event, data) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(cb => {
            try { cb(data); } catch (e) { /* 忽略回调异常 */ }
        });
    }

    // ========== 设置 VM ==========
    setVM (vm) {
        this.vm = vm;
        const originalToJSON = vm.toJSON.bind(vm);
        vm.toJSON = () => {
            const result = originalToJSON();
            let projectData;
            if (typeof result === 'string') {
                try { projectData = JSON.parse(result); } catch (e) { return result; }
            } else {
                projectData = result;
            }
            if (projectData.meta && projectData.meta.platform) {
                projectData.meta.platform.name = 'FrostEditor';
                projectData.meta.platform.url = 'https://froste.top/';
            } else {
                if (!projectData.meta) projectData.meta = {};
                projectData.meta.platform = { name: 'FrostEditor', url: 'https://froste.top/' };
            }
            if (projectData.meta && projectData.meta.agent) {
                if (typeof projectData.meta.agent === 'string') projectData.meta.agent = 'FrostEditor';
                else if (typeof projectData.meta.agent === 'object') {
                    projectData.meta.agent.name = 'FrostEditor';
                    projectData.meta.agent.url = 'https://froste.top/';
                }
            }
            return typeof result === 'string' ? JSON.stringify(projectData) : projectData;
        };
        const originalLoadProject = vm.loadProject.bind(vm);
        const self = this;
        vm.loadProject = async (...args) => {
            const isRemote = self._isApplyingRemote;
            self.isLoadingProject = true;
            try {
                const result = await originalLoadProject(...args);
                if (self.isConnected && !isRemote) {
                    // 用户主动加载本地项目，自动退出协作房间（与旧行为一致）
                    self.leaveRoom();
                }
                return result;
            } catch (e) {
                throw e;
            } finally {
                setTimeout(() => {
                    self.isLoadingProject = false;
                    self._isApplyingRemote = false;
                }, 500);
            }
        };
        this._bindVMListeners();
    }

    _bindVMListeners () {
        if (!this.vm || !this.vm.runtime || this._vmListenersBound) return;
        this._vmListenersBound = true;
        const onChange = () => {
            if (this._isApplyingRemote || !this.isConnected) return;
            if (this._snapshotTimer) clearTimeout(this._snapshotTimer);
            this._snapshotTimer = setTimeout(() => this._captureAndBroadcast(), SNAPSHOT_DEBOUNCE);
        };
        this.vm.runtime.on('PROJECT_CHANGED', onChange);
        this.vm.runtime.on('TARGETS_UPDATE', onChange);
        this.vm.runtime.on('EXTENSION_ADDED', onChange);
        this.vm.runtime.on('EXTENSION_REMOVED', onChange);
    }

    // ========== 房间 / 用户 ==========
    setUsername (username) {
        this.username = username || '用户';
        try { localStorage.setItem('collaborationUsername', this.username); } catch (e) {}
    }
    generateMemberId () { return randId(); }
    _nextColor () {
        const c = this.colorPalette[this._colorIndex % this.colorPalette.length];
        this._colorIndex++;
        return c;
    }

    saveRoomInfo () {
        try {
            localStorage.setItem('collaborationRoomInfo', JSON.stringify({
                roomKey: this.roomKey, username: this.username
            }));
        } catch (e) {}
    }
    clearRoomInfo () {
        try { localStorage.removeItem('collaborationRoomInfo'); } catch (e) {}
    }
    restoreLastRoom () {
        try {
            const saved = localStorage.getItem('collaborationRoomInfo');
            if (!saved) return;
            const info = JSON.parse(saved);
            if (info.roomKey) {
                if (info.username) this.username = info.username;
                this.joinRoom(info.roomKey);
            }
        } catch (e) { this.clearRoomInfo(); }
    }

    // ========== 创建房间（作为房主） ==========
    createRoom (roomKey = null) {
        if (this.isConnecting || this.isConnected) return Promise.reject(new Error('已在房间中'));
        const key = sanitizeRoom(roomKey) || genRoomKey().toLowerCase();
        this.roomKey = key.toUpperCase();
        this.memberId = hostPeerId(key);
        this.isHost = true;
        this.isConnecting = true;
        this._isLeavingRoom = false;

        return new Promise((resolve, reject) => {
            let peer;
            try {
                peer = new (requirePeer())(this.memberId);
            } catch (e) {
                this.isConnecting = false;
                reject(e);
                return;
            }
            this.peer = peer;

            peer.on('open', (id) => {
                this.isConnecting = false;
                this.isConnected = true;
                this.members = [{
                    id: this.memberId, username: this.username, isHost: true,
                    color: this._nextColor()
                }];
                this.memberColors[this.memberId] = this.members[0].color;
                this.saveRoomInfo();
                this.emit('connected');
                this.emit('room-created', {roomKey: this.roomKey, isHost: true});
                this.emit('members-updated', this.members);
                resolve({roomKey: this.roomKey, isHost: true, members: this.members});
            });
            peer.on('connection', (conn) => this._onIncomingConnection(conn));
            peer.on('error', (err) => {
                const msg = (err && err.message) || String(err);
                if (this.isConnecting) {
                    this.isConnecting = false;
                    this.emit('error', {message: `创建房间失败：${msg}`});
                    reject(new Error(msg));
                } else if (!this._isLeavingRoom) {
                    this.emit('error', {message: msg});
                }
            });
            peer.on('disconnected', () => {
                if (!this._isLeavingRoom) this.emit('disconnected');
            });
        });
    }

    // ========== 加入房间（作为成员） ==========
    joinRoom (roomKey, serverUrl = null) {
        if (this.isConnecting || this.isConnected) return Promise.reject(new Error('已在房间中'));
        if (!roomKey) return Promise.reject(new Error('请输入房间密钥'));
        const key = sanitizeRoom(roomKey);
        if (!key) return Promise.reject(new Error('房间密钥无效'));
        this.roomKey = key.toUpperCase();
        this.memberId = clientPeerId(key);
        this.isHost = false;
        this.isConnecting = true;
        this._isLeavingRoom = false;
        this.hasReceivedProject = false;
        this._joinResolve = null;
        this._joinReject = null;
        this._joinResolved = false;

        return new Promise((resolve, reject) => {
            this._joinResolve = resolve;
            this._joinReject = reject;
            this._joinResolved = false;
            let peer;
            try {
                peer = new (requirePeer())(this.memberId);
            } catch (e) {
                this.isConnecting = false;
                reject(e);
                return;
            }
            this.peer = peer;

            const timeout = setTimeout(() => {
                if (this.isConnecting) {
                    this.isConnecting = false;
                    this.emit('room-not-found', {});
                    this.emit('error', {message: `连接房间超时，房间 "${this.roomKey}" 可能不存在或房主不在线`});
                    this._destroyPeer();
                    this._joinResolved = true;
                    this._joinResolve = null;
                    this._joinReject = null;
                    reject(new Error('连接超时'));
                }
            }, 15000);
            this._joinTimeout = timeout;

            peer.on('open', (id) => {
                const conn = peer.connect(hostPeerId(key), {
                    label: 'froste-collab', reliable: true
                });
                this.conn = conn;
                conn.on('open', () => {
                    if (this._joinTimeout) { clearTimeout(this._joinTimeout); this._joinTimeout = null; }
                    this.isConnecting = false;
                    this.isConnected = true;
                    this._send(conn, {t: 'hello', f: this.memberId, p: {username: this.username}});
                });
                conn.on('data', (data) => this._onData(data, conn, null));
                conn.on('close', () => {
                    if (this._isLeavingRoom) return;
                    this.emit('disconnected');
                    this.isConnected = false;
                });
                conn.on('error', () => {
                    if (this.isConnecting) {
                        this.isConnecting = false;
                        this.emit('room-not-found', {});
                        this.emit('error', {message: `无法连接到房间 "${this.roomKey}"，房主可能不在线`});
                        this._destroyPeer();
                        this._joinResolved = true;
                        this._joinResolve = null;
                        this._joinReject = null;
                        reject(new Error('连接失败'));
                    }
                });
            });
            peer.on('error', (err) => {
                const msg = (err && err.message) || String(err);
                if (this.isConnecting) {
                    this.isConnecting = false;
                    if (this._joinTimeout) { clearTimeout(this._joinTimeout); this._joinTimeout = null; }
                    this.emit('room-not-found', {});
                    this.emit('error', {message: `加入房间失败：${msg}`});
                    this._destroyPeer();
                    this._joinResolved = true;
                    this._joinResolve = null;
                    this._joinReject = null;
                    reject(new Error(msg));
                }
            });
        });
    }

    // ========== 房主：处理成员拨入 ==========
    _onIncomingConnection (conn) {
        const memberId = conn.peer;
        this.peerConns.set(memberId, conn);
        conn.on('data', (data) => this._onData(data, conn, memberId));
        conn.on('close', () => this._onMemberLeave(memberId));
        conn.on('error', () => this._onMemberLeave(memberId));
    }

    // ========== 消息接收 ==========
    _onData (data, conn, fromMemberId) {
        let msg;
        try { msg = (typeof data === 'string') ? JSON.parse(data) : data; }
        catch (e) { return; }
        if (msg.t === 'chunk') { this._handleChunk(msg, conn, fromMemberId); return; }
        this._handleMessage(msg, conn, fromMemberId);
    }

    _handleMessage (msg, conn, fromMemberId) {
        const {t, p} = msg;
        if (this.isHost) {
            switch (t) {
            case 'hello':
                this._hostAddMember(conn, p);
                return;
            case 'leave':
                this._onMemberLeave(fromMemberId);
                return;
            case 'project-request':
                this._hostSendProject(conn);
                return;
            default:
                // 中继类消息：先本地应用，再转发给其他成员
                if (RELAY_TYPES.has(t)) {
                    this._applyIncoming(msg, fromMemberId);
                    this.peerConns.forEach((c, id) => {
                        if (id !== fromMemberId && c.open) this._send(c, msg);
                    });
                }
                return;
            }
        } else {
            this._applyIncoming(msg, fromMemberId);
        }
    }

    // 房主：新成员加入
    _hostAddMember (conn, p) {
        const memberId = conn.peer;
        const member = {
            id: memberId, username: p.username || '用户', isHost: false,
            color: this._nextColor()
        };
        this.members.push(member);
        this.memberColors[memberId] = member.color;
        // 告知新成员 Welcome（含成员列表与权限）
        this._send(conn, {
            t: 'welcome', f: this.memberId,
            p: {yourId: memberId, members: this.members, canEdit: true}
        });
        // 下发当前项目
        this._hostSendProject(conn);
        // 通知其他成员
        this.peerConns.forEach((c, id) => {
            if (id !== memberId && c.open) {
                this._send(c, {t: 'peer-join', f: this.memberId, p: member});
            }
        });
        this.emit('member-joined', member);
        this.emit('members-updated', this.members);
    }

    _hostSendProject (conn) {
        if (!this.vm) return;
        const json = this.vm.toJSON();
        const payload = {format: 'json', data: typeof json === 'string' ? json : JSON.stringify(json)};
        this._sendChunked(conn, {t: 'project-init', f: this.memberId, p: payload});
    }

    // 成员离开
    _onMemberLeave (memberId) {
        if (!memberId) return;
        const existed = this.members.find(m => m.id === memberId);
        this.peerConns.delete(memberId);
        delete this.memberColors[memberId];
        delete this.memberTabs[memberId];
        delete this.mousePositions[memberId];
        delete this.memberPermissions[memberId];
        this.members = this.members.filter(m => m.id !== memberId);
        if (existed) {
            this.emit('member-left', memberId);
            this.emit('members-updated', this.members);
            // 房主广播离开事件给其余成员
            if (this.isHost) {
                this.peerConns.forEach((c) => {
                    if (c.open) this._send(c, {t: 'peer-leave', f: this.memberId, p: {id: memberId}});
                });
            }
        }
    }

    // ========== 应用收到的消息（本地效果） ==========
    _applyIncoming (msg, fromMemberId) {
        const {t, p} = msg;
        switch (t) {
        case 'welcome':
            this.members = p.members || this.members;
            this.memberId = p.yourId || this.memberId;
            this.canEdit = (p.canEdit !== false);
            this.emit('room-joined', {roomKey: this.roomKey, isHost: false, members: this.members});
            this.emit('members-updated', this.members);
            this.emit('connected');
            if (!this._joinResolved && this._joinResolve) {
                this._joinResolved = true;
                this._joinResolve({roomKey: this.roomKey, isHost: false, members: this.members});
                this._joinResolve = null;
                this._joinReject = null;
            }
            break;
        case 'members':
            this.members = p.members || this.members;
            this.emit('members-updated', this.members);
            break;
        case 'peer-join':
            if (!this.members.find(m => m.id === p.id)) this.members.push(p);
            this.memberColors[p.id] = p.color;
            this.emit('member-joined', p);
            this.emit('members-updated', this.members);
            break;
        case 'peer-leave':
            this._onMemberLeave(p.id);
            break;
        case 'project-init':
        case 'project-update':
            this._applyProject(p);
            break;
        case 'cursor':
            this.mousePositions[fromMemberId] = {
                x: p.x, y: p.y, color: (this.memberColors[fromMemberId]), username: p.username
            };
            this.emit('mouse-move', {memberId: fromMemberId, ...this.mousePositions[fromMemberId]});
            break;
        case 'chat':
            this.chatMessages.push(p);
            this.emit('chat-message', p);
            break;
        case 'extension-update':
            this._applyExtensionUpdate(p);
            break;
        case 'extension-unload':
            this._applyExtensionUnload(p.id);
            break;
        case 'tab':
            this.memberTabs[fromMemberId] = p.tab;
            this.emit('member-tab-changed', {memberId: fromMemberId, tab: p.tab});
            break;
        case 'statement':
            this.emit('statement-updated', {text: p.text, username: p.username, memberId: fromMemberId});
            break;
        case 'mindmap':
            this.emit('mindmap-update', p.data);
            break;
        case 'permission':
            this.memberPermissions[p.memberId] = {canEdit: p.canEdit};
            if (p.memberId === this.memberId) this.canEdit = p.canEdit;
            this.emit('permission-changed', p);
            break;
        case 'kick':
            if (p.targetId === this.memberId) {
                this.emit('kicked', {reason: p.reason || '你被移出了房间'});
                this.leaveRoom();
            }
            break;
        default:
            break;
        }
    }

    _applyProject (p) {
        if (!this.vm) return;
        this._isApplyingRemote = true;
        try {
            if (p.format === 'json') {
                this.vm.fromJSON(p.data);
            } else if (p.format === 'sb3' && p.data) {
                // data 为 base64，转 ArrayBuffer 后 loadProject
                const bin = atob(p.data);
                const buf = new ArrayBuffer(bin.length);
                const view = new Uint8Array(buf);
                for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
                this.vm.loadProject(buf);
            }
            this.hasReceivedProject = true;
            this.emit('project-updated', p);
            this.emit('blocks-updated', p);
            this.emit('blockly-event-applied', p);
        } catch (e) {
            console.warn('[协作] 应用远程项目失败:', e);
        } finally {
            setTimeout(() => { this._isApplyingRemote = false; }, 100);
        }
    }

    _applyExtensionUpdate (p) {
        if (!this.vm) return;
        const ext = p.extensions || {};
        Object.keys(ext).forEach(id => {
            const url = ext[id];
            try {
                if (this.vm.extensionManager && this.vm.extensionManager.loadExtensionURL) {
                    this.vm.extensionManager.loadExtensionURL(url);
                }
            } catch (e) { console.warn('[协作] 加载扩展失败:', id, e); }
        });
    }
    _applyExtensionUnload (id) {
        if (!this.vm) return;
        try {
            if (this.vm.extensionManager && this.vm.extensionManager.unloadExtension) {
                this.vm.extensionManager.unloadExtension(id);
            } else if (typeof this.vm.emit === 'function') {
                this.vm.emit('EXTENSION_REMOVED', {id});
            }
        } catch (e) { console.warn('[协作] 卸载扩展失败:', id, e); }
    }

    // ========== 本地改动捕获与广播 ==========
    _captureAndBroadcast () {
        if (!this.vm || this._isApplyingRemote || !this.isConnected) return;
        const json = this.vm.toJSON();
        const payload = {format: 'json', data: typeof json === 'string' ? json : JSON.stringify(json)};
        this._broadcast({t: 'project-update', f: this.memberId, p: payload}, true);
    }

    // 统一发送入口：客户端 -> host；房主 -> 所有成员
    _broadcast (msg, skipSelf) {
        if (this.isHost) {
            this.peerConns.forEach((c) => { if (c.open) this._send(c, msg); });
            if (!skipSelf) this._applyIncoming(msg, this.memberId);
        } else if (this.conn && this.conn.open) {
            this._send(this.conn, msg);
        }
    }

    // ========== 对外方法（供 UI / 其它模块调用） ==========
    sendMousePosition (x, y) {
        const now = Date.now();
        if (now - this._lastMouseSendTime < 50) return; // 节流 ~20fps
        this._lastMouseSendTime = now;
        this._broadcast({t: 'cursor', f: this.memberId, p: {x, y, username: this.username}}, true);
    }
    sendChatMessage (text) {
        const msg = {
            id: randId(), username: this.username, text: String(text || ''),
            time: Date.now(), color: this.memberColors[this.memberId]
        };
        this._broadcast({t: 'chat', f: this.memberId, p: msg});
        this.chatMessages.push(msg);
        this.emit('chat-message', msg);
    }
    sendStatementUpdate (text) {
        this._broadcast({t: 'statement', f: this.memberId, p: {text, username: this.username}}, true);
    }
    sendTabSwitch (tab) {
        this.currentTab = tab;
        this._broadcast({t: 'tab', f: this.memberId, p: {tab}}, true);
    }
    sendExtensionUpdate (extensions) {
        this._broadcast({t: 'extension-update', f: this.memberId, p: {extensions}}, true);
    }
    sendExtensionUnload (extensionId) {
        this._broadcast({t: 'extension-unload', f: this.memberId, p: {id: extensionId}}, true);
    }
    sendMindmap (data) {
        this._broadcast({t: 'mindmap', f: this.memberId, p: {data}}, true);
    }
    kickMember (memberId) {
        if (!this.isHost) return;
        this._broadcast({t: 'kick', f: this.memberId, p: {targetId: memberId}}, true);
        this._onMemberLeave(memberId);
    }

    // ========== 离开 / 清理 ==========
    leaveRoom () {
        this._isLeavingRoom = true;
        this._joinResolved = true;
        this._joinResolve = null;
        this._joinReject = null;
        if (this._joinTimeout) { clearTimeout(this._joinTimeout); this._joinTimeout = null; }
        if (this.conn && this.conn.open) {
            try { this._send(this.conn, {t: 'leave', f: this.memberId, p: {}}); } catch (e) {}
        }
        this._destroyPeer();
        this.peerConns.clear();
        this.conn = null;
        this.roomKey = null;
        this.isHost = false;
        this.isConnected = false;
        this.isConnecting = false;
        this.hasReceivedProject = false;
        this.members = [];
        this.mousePositions = {};
        this.memberColors = {};
        this.memberTabs = {};
        this.memberPermissions = {};
        this.chatMessages = [];
        this._cleanupChunks();
        if (this._snapshotTimer) { clearTimeout(this._snapshotTimer); this._snapshotTimer = null; }
        this.clearRoomInfo();
        this.emit('left');
    }
    _destroyPeer () {
        if (this.peer && !this.peer.destroyed && this.peer.destroy) {
            try { this.peer.destroy(); } catch (e) {}
        }
        this.peer = null;
    }

    // ========== 分片传输 ==========
    _send (conn, msg) {
        if (!conn || !conn.open) return;
        const str = JSON.stringify(msg);
        if (str.length <= CHUNK_THRESHOLD) {
            try { conn.send(str); } catch (e) {}
            return;
        }
        const chunkId = randId();
        const total = Math.ceil(str.length / CHUNK_THRESHOLD);
        for (let i = 0; i < total; i++) {
            const part = str.substr(i * CHUNK_THRESHOLD, CHUNK_THRESHOLD);
            try { conn.send(JSON.stringify({t: 'chunk', f: this.memberId,
                p: {chunkId, index: i, total, data: part}})); } catch (e) {}
        }
    }
    _sendChunked (conn, msg) {
        this._send(conn, msg);
    }
    _handleChunk (msg, conn, fromMemberId) {
        const {chunkId, index, total, data} = msg.p;
        if (!this._pendingChunks[chunkId]) {
            this._pendingChunks[chunkId] = {total, parts: new Array(total), received: 0};
            this._chunkTimeouts[chunkId] = setTimeout(() => {
                delete this._pendingChunks[chunkId];
                delete this._chunkTimeouts[chunkId];
            }, CHUNK_TIMEOUT);
        }
        const buf = this._pendingChunks[chunkId];
        if (!buf.parts[index]) { buf.parts[index] = data; buf.received++; }
        if (buf.received >= total) {
            const full = buf.parts.join('');
            clearTimeout(this._chunkTimeouts[chunkId]);
            delete this._pendingChunks[chunkId];
            delete this._chunkTimeouts[chunkId];
            try {
                const reconstructed = JSON.parse(full);
                this._handleMessage(reconstructed, conn, fromMemberId);
            } catch (e) {}
        }
    }
    _cleanupChunks () {
        Object.keys(this._chunkTimeouts).forEach(k => clearTimeout(this._chunkTimeouts[k]));
        this._pendingChunks = {};
        this._chunkTimeouts = {};
    }
}

const collaborationManager = new CollaborationManager();
export default collaborationManager;
