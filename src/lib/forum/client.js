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

let userToken = null;
export function setUserToken (token) {
    userToken = token || null;
}
export function getUserToken () {
    return userToken;
}

client.interceptors.request.use((config) => {
    const token = userToken || FORUM_API_KEY;
    if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// 统一错误：把服务端返回 message 透出，方便 UI 直接 alert。
client.interceptors.response.use(
    (res) => res,
    (err) => {
        const data = err.response && err.response.data;
        const msg = (data && (data.message || data.error)) ||
            (err.message || '网络请求失败');
        const wrapped = new Error(msg);
        wrapped.status = err.response && err.response.status;
        wrapped.data = data;
        return Promise.reject(wrapped);
    }
);

export default client;
