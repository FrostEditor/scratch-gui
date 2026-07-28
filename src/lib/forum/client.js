/* eslint-disable */
import axios from 'axios';
import {FORUM_BASE_URL, FORUM_API_KEY} from './config.js';

// 论坛 API 客户端。所有请求默认带 Bearer 凭证：
// 优先使用用户登录后下发的个人 JWT（userToken），否则回退到客户端 API key。
const client = axios.create({
    baseURL: FORUM_BASE_URL,
    timeout: 30000,
    headers: {'Content-Type': 'application/json'}
});

const TOKEN_KEY = 'tw_forum_user_token';
let userToken = null;
export function setUserToken (token) {
    userToken = token || null;
    try {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* ignore */ }
}
export function getUserToken () {
    if (userToken) return userToken;
    try { return localStorage.getItem(TOKEN_KEY) || null; } catch (e) { return null; }
}
export function clearUserToken () {
    userToken = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
}

client.interceptors.request.use((config) => {
    const token = getUserToken() || FORUM_API_KEY;
    if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// 统一错误：把服务端返回 message 透出，方便 UI 直接 alert。
// 注意：论坛服务端返回的中文 message 偶尔是 GBK 字节被当 UTF-8 解读的乱码，
// 故优先按 HTTP 状态码给确定中文；网络层错误（无响应）通常是 CORS / 代理未
// 生效 / 断网，给出可操作的提示（devServer 代理修改后必须重启开发服务器）。
client.interceptors.response.use(
    (res) => res,
    (err) => {
        const resp = err.response;
        const data = resp && resp.data;
        const status = resp && resp.status;
        let msg = (data && (data.message || data.error)) || '';
        if (!resp) {
            // 无响应：请求没真正发出去（被浏览器 CORS 拦截 / 代理未生效 / 断网）
            msg = '无法连接论坛服务：请确认已重启 npm start（修改 devServer 代理配置后必须重启开发服务器，代理才会生效）。';
        } else if (!msg) {
            msg = (err.message || '网络请求失败');
        }
        const wrapped = new Error(msg);
        wrapped.status = status;
        wrapped.data = data;
        return Promise.reject(wrapped);
    }
);

export default client;
