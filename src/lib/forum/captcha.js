/* eslint-disable */
import client from './client.js';

// 获取人机验证题目：GET /captcha
// 返回结构（已对论坛前端 bundle 逆向确认）：
//   { token: string, image: string(base64 图文验证码), pow: { challenge: string, difficulty: number } }
export async function getCaptcha () {
    const {data} = await client.get('/captcha');
    return data;
}

// SHA-256 -> 十六进制字符串
async function sha256Hex (str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

// 计算 PoW nonce：找到使 SHA256(`${challenge}:${nonce}`) 前缀包含 `difficulty` 个 '0' 的 nonce。
// 与论坛前端 AuthCard 中的 solvePow(challenge, difficulty) 算法完全一致。
export async function solvePow (challenge, difficulty) {
    if (!crypto || !crypto.subtle) {
        throw new Error('当前环境不支持人机验证（需 HTTPS 或 localhost）');
    }
    const prefix = '0'.repeat(difficulty || 0);
    let nonce = 0;
    const limit = 6e7; // 与前端一致的上限
    while (nonce < limit) {
        const hash = await sha256Hex(`${challenge}:${nonce}`);
        if (hash.startsWith(prefix)) return String(nonce);
        nonce++;
    }
    throw new Error('人机验证计算超时，请刷新验证码重试');
}
