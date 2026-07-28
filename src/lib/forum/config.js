/* eslint-disable */
// 论坛社区（创客次元 / forum.ctspace.xyz）对接配置
//
// 跨域处理：论坛 API 未对 localhost 开放 CORS，浏览器直接 fetch 会报 Network Error。
// 解决方式：在 webpack-dev-server 中挂载同源代理 /forum-api -> https://forum.ctspace.xyz/api
// （见 webpack.config.js 的 devServer.proxy）。本地（localhost/127.0.0.1）运行时把 baseURL
// 指向同源 /forum-api，由 devServer 转发、不再触发浏览器 CORS；部署（非本地）时走完整远程
// 地址，届时需配合服务器反向代理或论坛开启 CORS。
const host = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '[::1]';
export const FORUM_BASE_URL = isLocalhost ? '/forum-api' : 'https://forum.ctspace.xyz/api';

// 官网编辑器客户端凭证（用户提供的 API key，绑定了官方账号）。
// 所有出站请求默认带 `Authorization: Bearer <API_KEY>`；
// 用户主动登录后优先使用服务端返回的个人 JWT。
export const FORUM_API_KEY = 'fk_live_21387abe8e2d146f167f7cd7292e6cf7';
