// PeerJS 信令服务器 - Cloudflare Workers 版本
// 使用 Durable Objects 管理客户端连接和消息转发

import { PeerJSServer } from './peerjs-server.js';

// 导出 Durable Object 类
export { PeerJSServer };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // 处理 PeerJS WebSocket 连接
    if (url.pathname === '/peerjs' || url.pathname.startsWith('/peerjs/')) {
      return handlePeerJS(request, env);
    }
    
    // 健康检查
    if (url.pathname === '/') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'FrostEditor PeerJS Signaling Server',
        version: '1.0.0'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Not Found', { status: 404 });
  }
};

async function handlePeerJS(request, env) {
  const url = new URL(request.url);
  
  // 获取参数
  const id = url.searchParams.get('id');
  const token = url.searchParams.get('token');
  const key = url.searchParams.get('key');
  
  // 验证必要参数
  if (!id || !token || !key) {
    return new Response(JSON.stringify({
      error: 'Missing parameters: id, token, key are required'
    }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // 验证 key（默认是 'peerjs'，可以改成你自己的）
  const VALID_KEY = 'peerjs';
  if (key !== VALID_KEY) {
    return new Response(JSON.stringify({
      error: 'Invalid key'
    }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // 检查是否是 WebSocket 升级请求
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response(JSON.stringify({
      error: 'Expected WebSocket upgrade request'
    }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // 获取 Durable Object
  // 使用单个 Durable Object 管理所有连接（适合中小规模）
  const doId = env.PEERJS_SERVER.idFromName('global');
  const server = env.PEERJS_SERVER.get(doId);
  
  // 创建 WebSocket 对
  const webSocketPair = new WebSocketPair();
  const [client, serverSocket] = Object.values(webSocketPair);
  
  // 交给 Durable Object 处理
  await server.handleConnection(serverSocket, id, token);
  
  // 返回 101 Switching Protocols
  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}
