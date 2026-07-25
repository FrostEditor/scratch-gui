// tw: 生产环境同源 CORS 代理服务器
//
// 开发环境由 webpack.config.js 的 devServer.before 自动挂载 /proxy。
// 正式部署（静态站点）时，需要一个真实服务器来提供 /proxy 路由，
// 否则跨域 .sb3 仍会被浏览器 CORS 拦截。本文件即为此目的：
//
//   用法：
//     node proxy-server.js                 # 监听 8602，代理路径 /proxy
//     PROXY_PORT=8080 node proxy-server.js # 自定义端口
//
// 然后把站点下的 /proxy 反向代理到该服务即可，例如 nginx：
//     location /proxy {
//         proxy_pass http://127.0.0.1:8602;
//         proxy_set_header Host $host;
//     }
//
// 复用 dev 环境同一份中间件，保证开发/生产行为一致。

const http = require('http');
const {corsProxyMiddleware} = require('./src/lib/tw-cors-proxy.js');

const PORT = process.env.PROXY_PORT || 8602;
const handler = corsProxyMiddleware();

const server = http.createServer((req, res) => {
    if (req.url.startsWith('/proxy')) {
        handler(req, res);
    } else {
        res.statusCode = 404;
        res.end('Not found');
    }
});

server.listen(PORT, () => {
    console.log(`[tw-cors-proxy] listening on http://127.0.0.1:${PORT}/proxy`);
});
