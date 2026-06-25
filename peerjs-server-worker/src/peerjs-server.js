// PeerJS 信令服务器 Durable Object
// 管理客户端连接、消息转发

export class PeerJSServer {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    
    // 客户端连接映射: clientId -> { socket, token, lastPing }
    this.clients = new Map();
    
    // 消息队列: clientId -> Array<message>（暂存离线消息）
    this.messageQueues = new Map();
    
    // 最大消息队列长度
    this.MAX_QUEUE_SIZE = 100;
    
    // 心跳超时时间（毫秒）
    this.HEARTBEAT_TIMEOUT = 90000; // 90秒
    
    // 启动心跳检查定时器
    this.startHeartbeatCheck();
  }
  
  // 处理 HTTP 请求（Durable Object 必须有 fetch 方法）
  async fetch(request) {
    return new Response('PeerJSServer Durable Object', { status: 200 });
  }
  
  // 处理新的 WebSocket 连接
  async handleConnection(socket, clientId, token) {
    console.log(`[PeerJS] 新连接: ${clientId}`);
    
    // 检查客户端是否已存在
    const existingClient = this.clients.get(clientId);
    
    if (existingClient) {
      // 客户端已存在，检查 token
      if (existingClient.token !== token) {
        // token 不匹配，ID 已被占用
        try {
          socket.accept();
          socket.send(JSON.stringify({
            type: 'ID-TAKEN',
            payload: { msg: 'ID is taken' }
          }));
          socket.close();
        } catch (e) {
          console.error('[PeerJS] 发送ID-TAKEN失败:', e);
        }
        return;
      }
      
      // token 匹配，重新连接（替换旧的 socket）
      console.log(`[PeerJS] 客户端重新连接: ${clientId}`);
      try {
        existingClient.socket.close();
      } catch (e) {
        // 忽略
      }
      existingClient.socket = socket;
      existingClient.lastPing = Date.now();
      
      // 接受连接
      socket.accept();
      
      // 设置事件监听
      this.setupSocketListeners(socket, clientId);
      
      // 发送暂存的消息
      this.flushMessageQueue(clientId);
      
    } else {
      // 新客户端，注册
      console.log(`[PeerJS] 注册新客户端: ${clientId}`);
      
      this.clients.set(clientId, {
        socket: socket,
        token: token,
        lastPing: Date.now()
      });
      
      // 接受连接
      socket.accept();
      
      // 设置事件监听
      this.setupSocketListeners(socket, clientId);
      
      // 发送 OPEN 消息
      try {
        socket.send(JSON.stringify({ type: 'OPEN' }));
      } catch (e) {
        console.error('[PeerJS] 发送OPEN失败:', e);
      }
    }
  }
  
  // 设置 socket 事件监听
  setupSocketListeners(socket, clientId) {
    socket.addEventListener('message', (event) => {
      this.handleMessage(clientId, event.data);
    });
    
    socket.addEventListener('close', () => {
      console.log(`[PeerJS] 客户端断开: ${clientId}`);
      this.handleDisconnect(clientId);
    });
    
    socket.addEventListener('error', (error) => {
      console.error(`[PeerJS] 客户端错误: ${clientId}`, error);
      this.handleDisconnect(clientId);
    });
  }
  
  // 处理收到的消息
  handleMessage(clientId, data) {
    try {
      const message = JSON.parse(data);
      
      // 更新心跳时间
      const client = this.clients.get(clientId);
      if (client) {
        client.lastPing = Date.now();
      }
      
      // 处理心跳
      if (message.type === 'HEARTBEAT') {
        return;
      }
      
      // 处理 LEAVE
      if (message.type === 'LEAVE') {
        this.handleDisconnect(clientId);
        return;
      }
      
      // 处理需要转发的消息（OFFER, ANSWER, CANDIDATE 等）
      if (message.dst) {
        this.forwardMessage(clientId, message);
      }
      
    } catch (e) {
      console.error('[PeerJS] 处理消息失败:', e);
    }
  }
  
  // 转发消息
  forwardMessage(srcId, message) {
    const dstId = message.dst;
    
    // 添加 src 字段
    const messageToSend = { ...message, src: srcId };
    
    const dstClient = this.clients.get(dstId);
    
    if (dstClient && dstClient.socket.readyState === 1) { // WebSocket.OPEN = 1
      // 目标在线，直接发送
      try {
        dstClient.socket.send(JSON.stringify(messageToSend));
      } catch (e) {
        console.error(`[PeerJS] 发送消息失败: ${srcId} -> ${dstId}`, e);
        // 发送失败，暂存到队列
        this.queueMessage(dstId, messageToSend);
      }
    } else {
      // 目标不在线，暂存到队列
      console.log(`[PeerJS] 目标不在线，暂存消息: ${srcId} -> ${dstId}`);
      this.queueMessage(dstId, messageToSend);
    }
  }
  
  // 将消息加入队列
  queueMessage(dstId, message) {
    if (!this.messageQueues.has(dstId)) {
      this.messageQueues.set(dstId, []);
    }
    
    const queue = this.messageQueues.get(dstId);
    queue.push(message);
    
    // 限制队列大小
    if (queue.length > this.MAX_QUEUE_SIZE) {
      queue.shift();
    }
  }
  
  // 发送暂存的消息
  flushMessageQueue(clientId) {
    const queue = this.messageQueues.get(clientId);
    if (!queue || queue.length === 0) return;
    
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== 1) return;
    
    console.log(`[PeerJS] 发送 ${queue.length} 条暂存消息给 ${clientId}`);
    
    while (queue.length > 0) {
      const message = queue.shift();
      try {
        client.socket.send(JSON.stringify(message));
      } catch (e) {
        // 发送失败，重新放回队列
        queue.unshift(message);
        break;
      }
    }
  }
  
  // 处理客户端断开
  handleDisconnect(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      try {
        if (client.socket.readyState === 1) {
          client.socket.close();
        }
      } catch (e) {
        // 忽略
      }
      this.clients.delete(clientId);
    }
    
    // 注意：不删除消息队列，这样客户端重新连接时还能收到之前的消息
    // 如果需要清理，可以在这里加
  }
  
  // 启动心跳检查
  startHeartbeatCheck() {
    // 每 30 秒检查一次
    setInterval(() => {
      this.checkHeartbeats();
    }, 30000);
  }
  
  // 检查心跳，超时的断开连接
  checkHeartbeats() {
    const now = Date.now();
    
    for (const [clientId, client] of this.clients.entries()) {
      const timeSinceLastPing = now - client.lastPing;
      
      if (timeSinceLastPing > this.HEARTBEAT_TIMEOUT) {
        console.log(`[PeerJS] 客户端心跳超时，断开: ${clientId}`);
        this.handleDisconnect(clientId);
      }
    }
  }
}
