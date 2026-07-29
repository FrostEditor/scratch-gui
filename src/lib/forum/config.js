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
// Electron 桌面端：编辑器页面运行在 tw-editor:// 自定义协议下。论坛服务端 CORS 白名单
// 不含该 origin，直连会被预检拦截。桌面端主进程的协议处理器（desktop/src-main/protocols.js）
// 已把 /forum-api、/forum-files、/netease、/proxy 实现为同源端点，因此桌面端也走相对路径。
const isDesktop = (typeof window !== 'undefined' && window.location && window.location.protocol === 'tw-editor:');
export const FORUM_BASE_URL = (isLocalhost || isDesktop) ? '/forum-api' : 'https://forum.ctspace.xyz/api';

// 论坛站点根（用于下载 sb3 等静态资源）。sb3Url 形如 /uploads/xxx.sb3，
// 论坛未对 /uploads 开放 CORS，本地走 /forum-files 同源代理；
// 生产部署需配合 Cloudflare Pages _redirects: /forum-files/* → forum.ctspace.xyz/:splat 200
export const FORUM_ORIGIN = (isLocalhost || isDesktop) ? '/forum-files' : 'https://forum.ctspace.xyz';
export const IS_DESKTOP_APP = isDesktop;

// 官网编辑器客户端凭证（用户提供的 API key，绑定了官方账号）。
// 所有出站请求默认带 `Authorization: Bearer <API_KEY>`；
// 用户主动登录后优先使用服务端返回的个人 JWT。
export const FORUM_API_KEY = 'fk_live_21387abe8e2d146f167f7cd7292e6cf7';
