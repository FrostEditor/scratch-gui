// PeerJS 信令服务器
// 用于 FrostEditor 多人协作的 P2P 信令

const { PeerServer } = require('peer');
const express = require('express');
const http = require('http');

const PORT = process.env.PORT || 9000;
const PATH = process.env.PATH || '/';
const KEY = process.env.KEY || 'froste';

const app = express();
const server = http.createServer(app);

// 创建 PeerServer
const peerServer = PeerServer({
  port: PORT,
  path: PATH,
  key: KEY,
  debug: true,
  allow_discovery: false, // 不允许获取所有 peer 列表
  proxied: true, // 如果前面有反向代理（Nginx/Cloudflare），设为 true
});

// 挂载到 HTTP 服务器
app.use(PATH, peerServer);

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'froste-peer-server',
    time: new Date().toISOString()
  });
});

server.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`FrostEditor PeerJS 信令服务器已启动`);
  console.log(`端口: ${PORT}`);
  console.log(`路径: ${PATH}`);
  console.log(`Key: ${KEY}`);
  console.log(`健康检查: http://localhost:${PORT}/health`);
  console.log(`========================================`);
});

// 错误处理
server.on('error', (err) => {
  console.error('服务器错误:', err);
});

peerServer.on('connection', (client) => {
  console.log(`[PeerJS] 客户端连接: ${client.id}`);
});

peerServer.on('disconnect', (client) => {
  console.log(`[PeerJS] 客户端断开: ${client.id}`);
});
