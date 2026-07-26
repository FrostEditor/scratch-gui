// 本地端到端测试：直接复用生产/开发同款的 corsProxyMiddleware，
// 起一个最小 http 服务器把 /proxy 挂上去，用 curl 验证网易云下载通不通。
const http = require('http');
const {corsProxyMiddleware} = require('./src/lib/tw-cors-proxy.js');

const PORT = 8787;
const handler = corsProxyMiddleware();

const server = http.createServer((req, res) => {
    if (req.url.startsWith('/proxy')) {
        handler(req, res);
        return;
    }
    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    res.statusCode = 200;
    res.end('<h1>local proxy test server</h1> use /proxy?url=...');
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`local proxy test server on http://127.0.0.1:${PORT}`);
});
