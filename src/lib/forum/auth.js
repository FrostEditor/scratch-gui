/* eslint-disable */
import client, {setUserToken, clearUserToken} from './client.js';

// 账号密码登录（需人机验证字段）。POST /auth/login
// 成功返回 { token, user }，自动写入后续请求的 Bearer。
export async function login ({username, password, captcha}) {
    const body = {username, password};
    if (captcha) {
        body.captchaToken = captcha.captchaToken;
        body.captchaAnswer = captcha.captchaAnswer;
        body.captchaPowNonce = captcha.captchaPowNonce;
    }
    const {data} = await client.post('/auth/login', body);
    if (data && data.token) setUserToken(data.token);
    return data;
}

// 注册新账号（需人机验证字段）。POST /auth/register
export async function register ({username, email, password, captcha}) {
    const body = {username, email, password};
    if (captcha) {
        body.captchaToken = captcha.captchaToken;
        body.captchaAnswer = captcha.captchaAnswer;
        body.captchaPowNonce = captcha.captchaPowNonce;
    }
    const {data} = await client.post('/auth/register', body);
    if (data && data.token) setUserToken(data.token);
    return data;
}

// 获取当前账号资料。GET /auth/me
export async function getMe () {
    const {data} = await client.get('/auth/me');
    return data;
}

// 更新当前账号资料。PATCH /auth/me
export async function updateMe (patch) {
    const {data} = await client.patch('/auth/me', patch);
    return data;
}

// 退出登录（清除内存中的个人 JWT，回退到客户端 API key）。
export function logout () {
    clearUserToken();
}
