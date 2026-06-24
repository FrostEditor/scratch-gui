// ============================================================
// FrostEditor 多人协作服务器 - Cloudflare Workers 单文件版本
// 可以直接复制粘贴到 Cloudflare Workers 在线编辑器中
// ============================================================

// ---------- Durable Object: 房间实例 ----------
// 每个房间对应一个 Durable Object 实例，管理房间状态和 WebSocket 连接
export class RoomObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    
    // 房间状态
    this.roomKey = null;
    this.members = new Map(); // memberId -> { id, username, isHost, ws }
    this.projectData = null;
    this.fullProjectData = null; // 完整项目数据（sb3 base64）
    this.hostId = null;
    
    // 从存储中恢复状态（如果有的话）
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get('roomState');
      if (stored) {
        this.roomKey = stored.roomKey;
        this.hostId = stored.hostId;
        this.projectData = stored.projectData;
        this.fullProjectData = stored.fullProjectData;
        // 注意：members 中的 WebSocket 连接不能持久化，需要重新建立
      }
    });
  }

  // 处理 HTTP 请求（WebSocket 升级）
  async fetch(request) {
    const url = new URL(request.url);
    
    // 只处理 WebSocket 连接
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const memberId = url.searchParams.get('memberId') || this.generateId();
    const username = url.searchParams.get('username') || '匿名用户';
    const roomKey = url.searchParams.get('roomKey');

    // 如果是新房间，设置房间密钥
    if (!this.roomKey && roomKey) {
      this.roomKey = roomKey;
    }

    // 创建 WebSocket 对
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // 接受 WebSocket 连接
    server.accept();

    // 添加成员
    const isFirstMember = this.members.size === 0;
    const isHost = isFirstMember; // 第一个成员是房主
    
    const member = {
      id: memberId,
      username: username,
      isHost: isHost,
      ws: server
    };

    this.members.set(memberId, member);
    
    if (isHost) {
      this.hostId = memberId;
    }

    console.log(`[房间 ${this.roomKey}] 新成员加入: ${username} (${memberId}), 房主: ${isHost}`);

    // 设置消息处理
    server.addEventListener('message', (event) => {
      this.handleMessage(memberId, event.data);
    });

    // 设置关闭处理
    server.addEventListener('close', () => {
      this.handleMemberLeave(memberId);
    });

    server.addEventListener('error', (error) => {
      console.error(`[房间 ${this.roomKey}] WebSocket 错误:`, error);
      this.handleMemberLeave(memberId);
    });

    // 发送加入成功消息
    this.sendToMember(memberId, {
      type: isFirstMember ? 'room-created' : 'room-joined',
      roomKey: this.roomKey,
      members: this.getMembersList(),
      isHost: isHost,
      projectData: this.projectData,
      fullProjectData: this.fullProjectData // 完整项目数据（sb3 base64）
    });

    // 广播新成员加入
    if (!isFirstMember) {
      this.broadcast({
        type: 'member-joined',
        member: {
          id: memberId,
          username: username,
          isHost: false
        }
      }, memberId);
    }

    // 保存状态
    this.saveState();

    return new Response(null, { status: 101, webSocket: client });
  }

  // 处理消息
  handleMessage(senderId, data) {
    try {
      const message = JSON.parse(data);
      const sender = this.members.get(senderId);
      if (!sender) return;

      switch (message.type) {
        case 'project-update':
          this.handleProjectUpdate(sender, message);
          break;
        case 'kick-member':
          this.handleKickMember(sender, message);
          break;
        case 'chat':
          this.handleChat(sender, message);
          break;
        case 'mouse-move':
          this.handleMouseMove(sender, message);
          break;
        case 'blockly-event':
          this.handleBlocklyEvent(sender, message);
          break;
        case 'leave-room':
          this.handleMemberLeave(senderId);
          break;
        default:
          console.log(`[房间 ${this.roomKey}] 未知消息类型:`, message.type);
      }
    } catch (e) {
      console.error(`[房间 ${this.roomKey}] 消息解析失败:`, e);
    }
  }

  // 处理项目更新
  handleProjectUpdate(sender, message) {
    this.projectData = message.projectData;
    
    // 如果有完整项目数据，也保存下来
    if (message.fullProjectData) {
      this.fullProjectData = message.fullProjectData;
    }
    
    // 广播给其他成员（只发送 JSON 版本，完整数据太大）
    this.broadcast({
      type: 'project-update',
      projectData: message.projectData,
      senderId: sender.id,
      senderName: sender.username
    }, sender.id);

    // 保存状态
    this.saveState();
  }

  // 处理踢出成员
  handleKickMember(sender, message) {
    if (!sender.isHost) return;

    const targetId = message.memberId;
    const target = this.members.get(targetId);
    
    if (target) {
      // 发送被踢消息
      this.sendToMember(targetId, {
        type: 'kicked',
        reason: message.reason || '你被房主移出了房间'
      });

      // 关闭连接
      try {
        target.ws.close();
      } catch (e) {
        // 忽略
      }

      // 从成员列表移除
      this.members.delete(targetId);

      console.log(`[房间 ${this.roomKey}] 成员被踢出: ${target.username}`);

      // 广播成员离开
      this.broadcast({
        type: 'member-left',
        memberId: targetId
      });

      this.saveState();
    }
  }

  // 处理聊天消息
  handleChat(sender, message) {
    this.broadcast({
      type: 'chat',
      senderId: sender.id,
      senderName: sender.username,
      message: message.message,
      timestamp: Date.now()
    });
  }

  // 处理鼠标移动
  handleMouseMove(sender, message) {
    // 直接广播给其他成员，不保存状态（鼠标位置是实时的）
    this.broadcast({
      type: 'mouse-move',
      memberId: sender.id,
      x: message.x,
      y: message.y
    }, sender.id);
  }

  // 处理 Blockly 事件（增量同步）
  handleBlocklyEvent(sender, message) {
    // 直接广播给其他成员，不保存状态（实时事件）
    this.broadcast({
      type: 'blockly-event',
      event: message.event,
      senderId: sender.id,
      senderName: sender.username
    }, sender.id);
  }

  // 处理成员离开
  handleMemberLeave(memberId) {
    const member = this.members.get(memberId);
    if (!member) return;

    this.members.delete(memberId);
    
    console.log(`[房间 ${this.roomKey}] 成员离开: ${member.username}`);

    // 如果离开的是房主，转移房主
    if (member.isHost && this.members.size > 0) {
      const firstMember = this.members.values().next().value;
      firstMember.isHost = true;
      this.hostId = firstMember.id;

      console.log(`[房间 ${this.roomKey}] 房主转移: ${firstMember.username}`);

      // 广播房主变更
      this.broadcast({
        type: 'host-changed',
        newHostId: firstMember.id
      });
    }

    // 广播成员离开
    this.broadcast({
      type: 'member-left',
      memberId: memberId
    });

    // 如果房间空了，保存状态（Durable Object 可能会被销毁，但状态会保留）
    if (this.members.size === 0) {
      console.log(`[房间 ${this.roomKey}] 房间已空`);
    }

    this.saveState();
  }

  // 发送消息给指定成员
  sendToMember(memberId, message) {
    const member = this.members.get(memberId);
    if (member && member.ws.readyState === 1) { // 1 = OPEN
      try {
        member.ws.send(JSON.stringify(message));
      } catch (e) {
        console.error(`[房间 ${this.roomKey}] 发送消息失败:`, e);
      }
    }
  }

  // 广播消息给所有成员
  broadcast(message, excludeId = null) {
    const data = JSON.stringify(message);
    
    for (const [id, member] of this.members) {
      if (id !== excludeId && member.ws.readyState === 1) {
        try {
          member.ws.send(data);
        } catch (e) {
          console.error(`[房间 ${this.roomKey}] 广播消息失败:`, e);
        }
      }
    }
  }

  // 获取成员列表（不含 WebSocket）
  getMembersList() {
    const members = [];
    for (const member of this.members.values()) {
      members.push({
        id: member.id,
        username: member.username,
        isHost: member.isHost
      });
    }
    return members;
  }

  // 生成随机 ID
  generateId() {
    return crypto.randomUUID();
  }

  // 保存状态到 Durable Object 存储
  async saveState() {
    await this.state.storage.put('roomState', {
      roomKey: this.roomKey,
      hostId: this.hostId,
      projectData: this.projectData,
      fullProjectData: this.fullProjectData
      // 注意：members 中的 WebSocket 连接不保存
    });
  }
}

// ---------- Worker 入口 ----------
// 处理 HTTP 请求，路由到对应的 Durable Object 房间实例
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Upgrade',
        },
      });
    }

    // 创建房间 API
    if (path === '/api/create-room') {
      return handleCreateRoom(request, env);
    }

    // 房间 WebSocket 连接
    if (path.startsWith('/room/')) {
      return handleRoomConnection(request, env);
    }

    // 健康检查
    if (path === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 默认返回 404
    return new Response('Not Found', { status: 404 });
  },
};

// 处理创建房间
async function handleCreateRoom(request, env) {
  // 生成 6 位随机房间密钥
  const roomKey = generateRoomKey();

  // 获取 Durable Object ID（基于房间密钥）
  const id = env.ROOM.idFromName(roomKey);
  const roomObject = env.ROOM.get(id);

  // 我们不需要在这里做什么，Durable Object 会在第一次连接时初始化
  // 只需要返回房间密钥给客户端

  return new Response(JSON.stringify({
    roomKey: roomKey,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// 处理房间 WebSocket 连接
async function handleRoomConnection(request, env) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const roomKey = pathParts[2];

  if (!roomKey) {
    return new Response('Room key is required', { status: 400 });
  }

  // 检查是否是 WebSocket 升级请求
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }

  // 获取 Durable Object ID（基于房间密钥）
  const id = env.ROOM.idFromName(roomKey);
  const roomObject = env.ROOM.get(id);

  // 构建新的 URL，把查询参数传过去
  const newUrl = new URL(url);
  newUrl.pathname = '/';
  if (!newUrl.searchParams.has('roomKey')) {
    newUrl.searchParams.set('roomKey', roomKey);
  }

  // 转发请求到 Durable Object
  return roomObject.fetch(new Request(newUrl, request));
}

// 生成房间密钥
function generateRoomKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  for (let i = 0; i < 6; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}
