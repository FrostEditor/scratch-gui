// Durable Object: 房间实例
// 每个房间对应一个 Durable Object 实例，管理房间状态和 WebSocket 连接

export class RoomObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    
    // 房间状态
    this.roomKey = null;
    this.members = new Map(); // memberId -> { id, username, isHost, ws }
    this.projectData = null;
    this.hostId = null;
    
    // 从存储中恢复状态（如果有的话）
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get('roomState');
      if (stored) {
        this.roomKey = stored.roomKey;
        this.hostId = stored.hostId;
        this.projectData = stored.projectData;
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
      projectData: this.projectData
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
    
    // 广播给其他成员
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
      projectData: this.projectData
      // 注意：members 中的 WebSocket 连接不保存
    });
  }
}
