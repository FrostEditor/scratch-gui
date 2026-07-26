// 一键本地服务器：托管 scratch-gui/build 页面 + 挂载 /proxy 同源代理。
// 用法：node _local_server.cjs   然后浏览器打开 http://127.0.0.1:8787/editor.html
const http = require('http');
const fs = require('fs');
const path = require('path');
const {corsProxyMiddleware} = require('./src/lib/tw-cors-proxy.js');

const PORT = 8800;
const ROOT = path.resolve(__dirname, 'build');
const proxyHandler = corsProxyMiddleware();

const MIME = {
    '.html': 'text/html; charset=UTF-8',
    '.js': 'text/javascript; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.map': 'application/json',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
    if (req.url.startsWith('/proxy')) {
        return proxyHandler(req, res);
    }
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/editor.html';
    const filePath = path.join(ROOT, urlPath);
    if (!filePath.startsWith(ROOT)) {
        res.statusCode = 403;
        return res.end('Forbidden');
    }
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.statusCode = 404;
            return res.end('Not found: ' + urlPath);
        }
        const ext = path.extname(filePath).toLowerCase();
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(data);
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`FrostEditor 本地服务器已启动：`);
    console.log(`  编辑器: http://127.0.0.1:${PORT}/editor.html`);
    console.log(`  /proxy 同源代理已挂载，网易云下载可用。`);
});
