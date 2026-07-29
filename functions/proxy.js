/**
 * Cloudflare Pages Function —— 同源 CORS 代理 /proxy
 *
 * 让部署在 Cloudflare Pages（editor.froste.top）上的编辑器也能使用
 * 跨域下载（网易云歌曲、远程 .sb3 等）。与开发环境 webpack-dev-server 挂载的
 * src/lib/tw-cors-proxy.js 行为对齐：
 *   - 仅允许 http/https
 *   - 拦截内网/回环地址（SSRF 防护）
 *   - 支持 referer 透传（网易云音频 CDN 需要）
 *   - 手动跟随重定向并保留 referer（避免跨域重定向丢失 Referer）
 *   - 远程返回 HTML 时返回 502（避免把错误页当资源下载）
 *   - 输出 Access-Control-Allow-Origin: *
 *
 * 路由：functions/proxy.js → 处理 /proxy?url=...&referer=...
 *
 * 注意：Cloudflare Workers/Pages 运行时不支持对 http://（非 TLS）地址发起出站
 * 请求，只能使用 https://。网易云音频 CDN 的 302 常常指向 http:// 链接，这里统一
 * 升级为 https。另外整段逻辑包了 try/catch，任何 fetch 异常都会返回可读的业务
 * 错误（而不是让 Cloudflare 返回笼统的 "error code: 502"）。
 *
 * deployed: 2026-07-26 (v3, retry deploy after CF build)
 */

const ALLOWED_SCHEMES = ['http:', 'https:'];
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 20000;

// ===== NetEase 网易云 weapi 加密 + 歌曲下载 =====
// 与 src/lib/tw-cors-proxy.js、proxy-worker/src/index.js 完全一致（WebCrypto + BigInt RSA）。
const NE_MODULUS = '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';
const NE_PUBKEY = '010001';
const NE_NONCE = '0CoJUm6Qyw8W8jud';
const NE_IV = '0102030405060708';
const NE_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const neCrypto = () => (globalThis.crypto && globalThis.crypto.subtle) ? globalThis.crypto : null;

function neRandomKey (len) {
    const arr = new Uint8Array(len);
    neCrypto().getRandomValues(arr);
    let s = '';
    for (let i = 0; i < len; i++) s += NE_CHARS[arr[i] % 62];
    return s;
}
async function neAesCbcBase64 (text, keyStr) {
    const c = neCrypto();
    const key = new TextEncoder().encode(keyStr);
    const iv = new TextEncoder().encode(NE_IV);
    const data = new TextEncoder().encode(text);
    const cryptoKey = await c.subtle.importKey('raw', key, {name: 'AES-CBC'}, false, ['encrypt']);
    const ct = await c.subtle.encrypt({name: 'AES-CBC', iv}, cryptoKey, data);
    const bytes = new Uint8Array(ct);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
}
function neModpow (base, exp, mod) {
    base = BigInt(base); exp = BigInt(exp); mod = BigInt(mod);
    let result = 1n; base = base % mod;
    while (exp > 0n) { if (exp % 2n === 1n) result = (result * base) % mod; exp = exp / 2n; base = (base * base) % mod; }
    return result;
}
async function neRsaEncrypt (textStr) {
    const bytes = new TextEncoder().encode(textStr);
    const rev = Array.from(bytes).reverse();
    const hex = rev.map(b => b.toString(16).padStart(2, '0')).join('');
    const bi = BigInt('0x' + hex);
    const pub = BigInt('0x' + NE_PUBKEY);
    const mod = BigInt('0x' + NE_MODULUS);
    const r = neModpow(bi, pub, mod);
    let out = r.toString(16);
    while (out.length < 256) out = '0' + out;
    return out;
}
async function neWeapi (obj) {
    const text = JSON.stringify(obj);
    const secKey = neRandomKey(16);
    const encText = await neAesCbcBase64(await neAesCbcBase64(text, NE_NONCE), secKey);
    const encSecKey = await neRsaEncrypt(secKey);
    return {params: encText, encSecKey};
}
async function handleNetease (request) {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id || !/^\d+$/.test(id)) {
        return new Response('Missing or invalid id', {status: 400});
    }
    try {
        const body = await neWeapi({ids: `[${id}]`, level: 'standard', encodeType: 'mp3', csrf_token: ''});
        const payload = `params=${encodeURIComponent(body.params)}&encSecKey=${encodeURIComponent(body.encSecKey)}`;
        const apiRes = await fetch('https://music.163.com/weapi/song/enhance/player/url/v1?csrf_token=', {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://music.163.com/'},
            body: payload
        });
        const json = await apiRes.json();
        const song = json && json.data && json.data[0];
        if (!song || !song.url) {
            return new Response('网易云未返回可播放地址：该歌曲可能需要登录网易云账号，或在本地区/网络下不可用。建议改用「上传声音」直接导入本地音频文件。', {status: 502});
        }
        const audioRes = await fetch(String(song.url).replace(/^http:\/\//i, 'https://'), {
            redirect: 'follow',
            headers: {'User-Agent': 'Mozilla/5.0', 'Referer': 'https://music.163.com/'}
        });
        if (!audioRes.ok) {
            return new Response(`Failed to fetch audio: HTTP ${audioRes.status}`, {status: 502});
        }
        const outHeaders = new Headers();
        outHeaders.set('Access-Control-Allow-Origin', '*');
        outHeaders.set('Content-Type', audioRes.headers.get('content-type') || 'audio/mpeg');
        const cl = audioRes.headers.get('content-length');
        if (cl) outHeaders.set('Content-Length', cl);
        return new Response(audioRes.body, {status: audioRes.status, headers: outHeaders});
    } catch (e) {
        return new Response(`NetEase proxy error: ${e && e.message ? e.message : String(e)}`, {status: 502});
    }
}

// 简单的主机名级 SSRF 防护（Cloudflare 边缘无法方便做 DNS 反查，这里按主机名拦截）
function isBlockedHost (hostname) {
    const h = (hostname || '').toLowerCase();
    if (!h) return true;
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
        return true;
    }
    if (h === '0.0.0.0' || h === '127.0.0.1' || h === '[::1]' || h === '::1') return true;
    const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
        const a = parseInt(m[1], 10);
        const b = parseInt(m[2], 10);
        if (a === 10) return true; // 10/8
        if (a === 127) return true; // 127/8
        if (a === 169 && b === 254) return true; // 169.254/16
        if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
        if (a === 192 && b === 168) return true; // 192.168/16
    }
    return false;
}

export async function onRequest (context) {
    try {
        const {request} = context;

        const reqUrl = new URL(request.url);
        if (reqUrl.pathname === '/netease') {
            return await handleNetease(request);
        }

        // 预检
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': '*'
                }
            });
        }

        const url = new URL(request.url);
        const target = url.searchParams.get('url');
        const referer = url.searchParams.get('referer');

        if (!target || !/^https?:\/\//i.test(target)) {
            return new Response('Missing or invalid url', {status: 400});
        }

        let parsed;
        try {
            parsed = new URL(target);
        } catch (e) {
            return new Response('Invalid url', {status: 400});
        }
        if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
            return new Response('Unsupported scheme', {status: 400});
        }
        if (isBlockedHost(parsed.hostname)) {
            return new Response('Blocked host', {status: 403});
        }

        const headers = {
            'User-Agent': 'TW-CorsProxy/1.0',
            'Accept': '*/*'
        };
        if (referer && /^https?:\/\//i.test(referer)) {
            headers['Referer'] = referer;
        }

        // Cloudflare 不能发 http:// 出站请求，统一升级为 https
        let current = target.replace(/^http:\/\//i, 'https://');

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        let res;
        try {
            for (let i = 0; i <= MAX_REDIRECTS; i++) {
                // 手动跟随重定向，保留 Referer（避免跨域重定向被剥离）
                res = await fetch(current, {
                    method: 'GET',
                    headers,
                    redirect: 'manual',
                    signal: controller.signal
                });
                if (res.status >= 300 && res.status < 400) {
                    const loc = res.headers.get('location');
                    if (!loc) break;
                    current = new URL(loc, current).toString().replace(/^http:\/\//i, 'https://');
                    continue;
                }
                break;
            }
        } finally {
            clearTimeout(timer);
        }

        if (res.status >= 300 && res.status < 400) {
            return new Response('Too many redirects', {status: 502});
        }

        // 远程返回 HTML（错误页）时拦截
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('text/html')) {
            return new Response('Remote returned HTML, not a valid resource', {status: 502});
        }

        const outHeaders = new Headers();
        outHeaders.set('Access-Control-Allow-Origin', '*');
        outHeaders.set('Content-Type', res.headers.get('content-type') || 'application/octet-stream');
        const cl = res.headers.get('content-length');
        if (cl) outHeaders.set('Content-Length', cl);
        outHeaders.set('Cache-Control', 'public, max-age=3600');

        return new Response(res.body, {
            status: res.status,
            headers: outHeaders
        });
    } catch (e) {
        const cause = e && e.cause ? (e.cause.message || String(e.cause)) : 'none';
        const msg = `Proxy error: ${e && e.message ? e.message : String(e)} | cause: ${cause}`;
        return new Response(msg, {
            status: 502,
            headers: {'Content-Type': 'text/plain; charset=UTF-8', 'Access-Control-Allow-Origin': '*'}
        });
    }
}
