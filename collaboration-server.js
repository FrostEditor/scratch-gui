// 多人协作 WebSocket 服务器
// 使用前请先安装依赖：npm install ws

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 8765;

const wss = new WebSocket.Server({ port: PORT });

// 房间管理
const rooms = new Map();

console.log(`[协作服务器] 启动中... 端口: ${PORT}`);

wss.on('connection', (ws) => {
    console.log('[协作服务器] 新客户端连接');
    
    ws.id = uuidv4();
    ws.roomId = null;
    ws.username = '匿名用户';
    ws.isHost = false;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(ws, data);
        } catch (e) {
            console.error('[协作服务器] 消息解析失败:', e);
        }
    });

    ws.on('close', () => {
        console.log('[协作服务器] 客户端断开:', ws.id);
        handleLeave(ws);
    });

    ws.on('error', (error) => {
        console.error('[协作服务器] 连接错误:', error);
    });
});

function handleMessage(ws, data) {
    switch (data.type) {
        case 'create-room':
            handleCreateRoom(ws, data);
            break;
        case 'join-room':
            handleJoinRoom(ws, data);
            break;
        case 'leave-room':
            handleLeave(ws);
            break;
        case 'project-update':
            handleProjectUpdate(ws, data);
            break;
        case 'kick-member':
            handleKickMember(ws, data);
            break;
        case 'chat':
            handleChat(ws, data);
            break;
        default:
            console.log('[协作服务器] 未知消息类型:', data.type);
    }
}

// 生成房间密钥
function generateRoomKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// 创建房间
function handleCreateRoom(ws, data) {
    const roomKey = generateRoomKey();
    const username = data.username || '匿名用户';
    
    ws.roomId = roomKey;
    ws.username = username;
    ws.isHost = true;

    const room = {
        key: roomKey,
        hostId: ws.id,
        members: new Map(),
        projectData: null
    };
    
    room.members.set(ws.id, {
        id: ws.id,
        username: username,
        isHost: true
    });

    rooms.set(roomKey, room);

    console.log(`[协作服务器] 房间创建: ${roomKey}, 创建者: ${username}`);

    // 发送创建成功消息
    send(ws, {
        type: 'room-created',
        roomKey: roomKey,
        members: getMembersList(room),
        isHost: true
    });
}

// 加入房间
function handleJoinRoom(ws, data) {
    const roomKey = data.roomKey?.toUpperCase();
    const username = data.username || '匿名用户';

    if (!roomKey) {
        send(ws, { type: 'error', message: '请输入房间密钥' });
        return;
    }

    const room = rooms.get(roomKey);
    if (!room) {
        send(ws, { type: 'error', message: '房间不存在' });
        return;
    }

    ws.roomId = roomKey;
    ws.username = username;
    ws.isHost = false;

    room.members.set(ws.id, {
        id: ws.id,
        username: username,
        isHost: false
    });

    console.log(`[协作服务器] 用户加入房间: ${roomKey}, 用户: ${username}`);

    // 发送加入成功消息
    send(ws, {
        type: 'room-joined',
        roomKey: roomKey,
        members: getMembersList(room),
        isHost: false,
        projectData: room.projectData
    });

    // 广播给房间内其他人
    broadcast(room, {
        type: 'member-joined',
        member: {
            id: ws.id,
            username: username,
            isHost: false
        }
    }, ws.id);
}

// 离开房间
function handleLeave(ws) {
    if (!ws.roomId) return;

    const room = rooms.get(ws.roomId);
    if (!room) return;

    room.members.delete(ws.id);

    console.log(`[协作服务器] 用户离开房间: ${ws.roomId}, 用户: ${ws.username}`);

    // 如果房间空了，删除房间
    if (room.members.size === 0) {
        rooms.delete(ws.roomId);
        console.log(`[协作服务器] 房间已销毁: ${ws.roomKey}`);
        return;
    }

    // 如果离开的是房主，转移房主
    if (ws.isHost && room.members.size > 0) {
        const firstMember = room.members.values().next().value;
        firstMember.isHost = true;
        room.hostId = firstMember.id;
        
        // 找到对应的 WebSocket 并设置 isHost
        wss.clients.forEach(client => {
            if (client.id === firstMember.id) {
                client.isHost = true;
            }
        });

        console.log(`[协作服务器] 房主转移: ${firstMember.username}`);

        // 广播房主变更
        broadcast(room, {
            type: 'host-changed',
            newHostId: firstMember.id
        });
    }

    // 广播成员离开
    broadcast(room, {
        type: 'member-left',
        memberId: ws.id
    });

    ws.roomId = null;
    ws.isHost = false;
}

// 项目更新
function handleProjectUpdate(ws, data) {
    if (!ws.roomId) return;

    const room = rooms.get(ws.roomId);
    if (!room) return;

    // 保存项目数据
    room.projectData = data.projectData;

    // 广播给房间内其他人
    broadcast(room, {
        type: 'project-update',
        projectData: data.projectData,
        senderId: ws.id,
        senderName: ws.username
    }, ws.id);
}

// 踢出成员
function handleKickMember(ws, data) {
    if (!ws.roomId || !ws.isHost) return;

    const room = rooms.get(ws.roomId);
    if (!room) return;

    const targetId = data.memberId;
    const targetClient = [...wss.clients].find(c => c.id === targetId);

    if (targetClient && targetClient.roomId === ws.roomId) {
        // 发送被踢消息
        send(targetClient, {
            type: 'kicked',
            reason: data.reason || '你被房主移出了房间'
        });

        // 断开连接
        targetClient.close();
    }
}

// 聊天消息
function handleChat(ws, data) {
    if (!ws.roomId) return;

    const room = rooms.get(ws.roomId);
    if (!room) return;

    broadcast(room, {
        type: 'chat',
        senderId: ws.id,
        senderName: ws.username,
        message: data.message,
        timestamp: Date.now()
    });
}

// 工具函数
function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function broadcast(room, data, excludeId = null) {
    wss.clients.forEach(client => {
        if (client.roomId === room.key && client.id !== excludeId && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

function getMembersList(room) {
    const members = [];
    room.members.forEach(member => {
        members.push({
            id: member.id,
            username: member.username,
            isHost: member.isHost
        });
    });
    return members;
}

console.log(`[协作服务器] 已启动，监听端口 ${PORT}`);
console.log(`[协作服务器] 请确保前端配置的服务器地址正确`);
