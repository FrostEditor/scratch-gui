/* eslint-disable */
// 论坛社区（创客次元 / forum.ctspace.xyz）对接配置
// baseURL 为后端 API 根路径（自研 SPA，挂在 EdgeOne 后）
export const FORUM_BASE_URL = 'https://forum.ctspace.xyz/api';

// 官网编辑器客户端凭证（用户提供的 API key，绑定了官方账号）。
// 所有出站请求默认带 `Authorization: Bearer <API_KEY>`；
// 用户主动登录后优先使用服务端返回的个人 JWT。
export const FORUM_API_KEY = 'fk_live_21387abe8e2d146f167f7cd7292e6cf7';
