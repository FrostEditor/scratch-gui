// Durable Object: 房间实例
// 每个房间对应一个 Durable Object 实例，管理房间状态和 WebSocket 连接

export class RoomObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    
    // 房间状态
    this.roomKey = null;
    this.members = new Map(); // memberId -> { id, username, isHost, canEdit, ws }
    this.projectData = null;
    this.fullProjectData = null; // 完整项目数据（sb3 base64）
    this.hostId = null;
    this.hostToken = null; // 房主令牌，用于恢复房主身份
    this.isPrivate = false; // 是否是私密房间
    this.pendingRequests = new Map(); // 待处理的加入申请 memberId -> { id, username, ws }
    
    // 从存储中恢复状态（如果有的话）
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get('roomState');
      if (stored) {
        this.roomKey = stored.roomKey;
        this.hostId = stored.hostId;
        this.hostToken = stored.hostToken;
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
    const hostToken = url.searchParams.get('hostToken');
    const isPrivate = url.searchParams.get('isPrivate') === 'true';

    // 如果是新房间，设置房间密钥和私密状态
    if (!this.roomKey && roomKey) {
      this.roomKey = roomKey;
      this.isPrivate = isPrivate;
    }

    // 创建 WebSocket 对
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // 接受 WebSocket 连接
    server.accept();
    
    // 检查是否是私密房间的加入申请
    if (this.roomKey && this.isPrivate && this.members.size > 0) {
      // 检查是否是房主（通过房主令牌）
      const isHostByToken = hostToken && this.hostToken && hostToken === this.hostToken;
      
      if (!isHostByToken) {
        // 加入待处理申请队列
        this.pendingRequests.set(memberId, {
          id: memberId,
          username: username,
          ws: server
        });
        
        console.log(`[房间 ${this.roomKey}] 新的加入申请: ${username} (${memberId})`);
        
        // 通知申请者等待批准
        this.sendToMemberWS(server, {
          type: 'join-request-pending',
          roomKey: this.roomKey
        });
        
        // 通知房主有新的加入申请
        this.broadcast({
          type: 'join-request',
          memberId: memberId,
          username: username
        });
        
        // 设置消息处理（处理取消申请等）
        server.addEventListener('message', (event) => {
          this.handlePendingMessage(memberId, event.data);
        });
        
        // 设置关闭处理
        server.addEventListener('close', () => {
          this.pendingRequests.delete(memberId);
          console.log(`[房间 ${this.roomKey}] 加入申请取消: ${username}`);
          // 通知房主申请已取消
          this.broadcast({
            type: 'join-request-cancelled',
            memberId: memberId
          });
        });
        
        return new Response(null, { status: 101, webSocket: client });
      }
    }

    // 添加成员
    const isFirstMember = this.members.size === 0;
    let isHost = isFirstMember; // 第一个成员默认是房主
    
    // 如果带上了房主令牌，并且匹配，就设为房主
    if (hostToken && this.hostToken && hostToken === this.hostToken) {
      isHost = true;
      console.log(`[房间 ${this.roomKey}] 通过房主令牌恢复房主身份: ${username}`);
    }
    
    // 如果是第一个成员（创建房间），生成房主令牌
    if (isFirstMember) {
      this.hostToken = this.generateId(); // 生成随机令牌
      console.log(`[房间 ${this.roomKey}] 生成房主令牌: ${this.hostToken}`);
    }
    
    // 如果新成员是房主，并且原来有房主，取消原来的房主身份
    if (isHost && this.hostId && this.hostId !== memberId) {
      const oldHost = this.members.get(this.hostId);
      if (oldHost) {
        oldHost.isHost = false;
        // 通知原房主他不再是房主了
        this.sendToMember(this.hostId, {
          type: 'host-changed',
          isHost: false
        });
      }
    }
    
    const member = {
      id: memberId,
      username: username,
      isHost: isHost,
      canEdit: true, // 默认有编辑权限
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
    const joinMessage = {
      type: isFirstMember ? 'room-created' : 'room-joined',
      roomKey: this.roomKey,
      members: this.getMembersList(),
      isHost: isHost,
      projectData: this.projectData,
      fullProjectData: this.fullProjectData // 完整项目数据（sb3 base64）
    };
    
    // 只有房主才能收到房主令牌
    if (isHost) {
      joinMessage.hostToken = this.hostToken;
    }
    
    this.sendToMember(memberId, joinMessage);

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
          
        case 'set-member-permission':
          this.handleSetMemberPermission(sender, message);
          break;
          
        case 'approve-join':
          this.handleApproveJoin(sender, message);
          break;
          
        case 'reject-join':
          this.handleRejectJoin(sender, message);
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

        case 'blocks-update':
          this.handleBlocksUpdate(sender, message);
          break;

        case 'signaling':
          // WebRTC 信令消息，点对点转发
          this.handleSignaling(sender, message);
          break;

        case 'data-relay':
          // 数据中继消息（WebRTC 没连上时的后备），点对点转发
          this.handleDataRelay(sender, message);
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
    if (!sender.canEdit) return; // 没有编辑权限则忽略
    
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
  
  // 处理设置成员权限
  handleSetMemberPermission(sender, message) {
    if (!sender.isHost) return; // 只有房主能修改权限
    
    const targetId = message.memberId;
    const canEdit = message.canEdit;
    const target = this.members.get(targetId);
    
    if (target) {
      target.canEdit = canEdit;
      
      console.log(`[房间 ${this.roomKey}] 成员权限变更: ${target.username} -> canEdit=${canEdit}`);
      
      // 通知目标成员
      this.sendToMember(targetId, {
        type: 'permission-changed',
        canEdit: canEdit
      });
      
      // 广播给所有成员
      this.broadcast({
        type: 'member-permission-changed',
        memberId: targetId,
        canEdit: canEdit
      });
      
      this.saveState();
    }
  }
  
  // 处理批准加入申请
  handleApproveJoin(sender, message) {
    if (!sender.isHost) return; // 只有房主能批准
    
    const targetId = message.memberId;
    const request = this.pendingRequests.get(targetId);
    
    if (request) {
      console.log(`[房间 ${this.roomKey}] 批准加入申请: ${request.username}`);
      
      // 从待处理队列移除
      this.pendingRequests.delete(targetId);
      
      // 添加到成员列表
      const member = {
        id: targetId,
        username: request.username,
        isHost: false,
        canEdit: true,
        ws: request.ws
      };
      
      this.members.set(targetId, member);
      
      // 设置消息处理
      request.ws.addEventListener('message', (event) => {
        this.handleMessage(targetId, event.data);
      });
      
      request.ws.addEventListener('close', () => {
        this.handleMemberLeave(targetId);
      });
      
      // 发送加入成功消息
      this.sendToMemberWS(request.ws, {
        type: 'room-joined',
        roomKey: this.roomKey,
        members: this.getMembersList(),
        isHost: false,
        projectData: this.projectData,
        fullProjectData: this.fullProjectData
      });
      
      // 广播新成员加入
      this.broadcast({
        type: 'member-joined',
        member: {
          id: targetId,
          username: request.username,
          isHost: false,
          canEdit: true
        }
      }, targetId);
      
      // 通知房主申请已处理
      this.broadcast({
        type: 'join-request-approved',
        memberId: targetId
      });
      
      this.saveState();
    }
  }
  
  // 处理拒绝加入申请
  handleRejectJoin(sender, message) {
    if (!sender.isHost) return; // 只有房主能拒绝
    
    const targetId = message.memberId;
    const request = this.pendingRequests.get(targetId);
    
    if (request) {
      console.log(`[房间 ${this.roomKey}] 拒绝加入申请: ${request.username}`);
      
      // 发送被拒绝消息
      this.sendToMemberWS(request.ws, {
        type: 'join-rejected',
        reason: message.reason || '房主拒绝了你的加入申请'
      });
      
      // 关闭连接
      try {
        request.ws.close();
      } catch (e) {}
      
      // 从待处理队列移除
      this.pendingRequests.delete(targetId);
      
      // 通知房主申请已处理
      this.broadcast({
        type: 'join-request-rejected',
        memberId: targetId
      });
    }
  }
  
  // 处理待处理申请的消息
  handlePendingMessage(memberId, data) {
    try {
      const message = JSON.parse(data);
      // 待处理申请的消息目前不需要处理什么
      console.log(`[房间 ${this.roomKey}] 待处理申请消息:`, message.type);
    } catch (e) {
      console.error(`[房间 ${this.roomKey}] 待处理申请消息解析失败:`, e);
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
    if (!sender.canEdit) return; // 没有编辑权限则忽略
    
    // 直接广播给其他成员，不保存状态（实时事件）
    this.broadcast({
      type: 'blockly-event',
      event: message.event,
      senderId: sender.id,
      senderName: sender.username
    }, sender.id);
  }

  // 处理积木更新（轻量同步）
  handleBlocksUpdate(sender, message) {
    if (!sender.canEdit) return; // 没有编辑权限则忽略
    
    // 直接广播给其他成员，不保存状态
    this.broadcast({
      type: 'blocks-update',
      targetId: message.targetId,
      blocks: message.blocks,
      memberId: sender.id,
      username: sender.username
    }, sender.id);
  }

  // 处理 WebRTC 信令消息（点对点转发）
  handleSignaling(sender, message) {
    const targetId = message.to;
    if (!targetId) return;

    const target = this.members.get(targetId);
    if (!target) return;

    this.sendToMember(targetId, {
      type: 'signaling',
      from: sender.id,
      to: targetId,
      payload: message.payload
    });
  }

  // 处理数据中继消息（WebRTC 没连上时的后备，点对点转发）
  handleDataRelay(sender, message) {
    const targetId = message.to;
    if (!targetId) return;

    const target = this.members.get(targetId);
    if (!target) return;

    this.sendToMember(targetId, {
      type: 'data-relay',
      from: sender.id,
      to: targetId,
      payload: message.payload
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
  
  // 直接给 WebSocket 发送消息
  sendToMemberWS(ws, message) {
    if (ws && ws.readyState === 1) {
      try {
        ws.send(JSON.stringify(message));
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
        isHost: member.isHost,
        canEdit: member.canEdit
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
