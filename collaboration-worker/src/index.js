// Cloudflare Workers 入口文件
// 处理 HTTP 请求，路由到对应的 Durable Object 房间实例

import { RoomObject } from './room-object.js';

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

// 导出 Durable Object
export { RoomObject };
