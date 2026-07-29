// tw: 同源 CORS 代理中间件
//
// 浏览器无法绕过跨域限制：远程服务器如果不返回 Access-Control-Allow-Origin，
// 直接 fetch 会被拦截。本中间件把「跨域请求」改成「同源请求」：
//   浏览器 -> 我们的服务器 /proxy?url=<目标URL> -> 服务器去拉远程文件 -> 原样回传
// 浏览器请求的是同源地址，因此不再受 CORS 限制。
//
// 三种用法：
//   1) webpack-dev-server (v3)：在 devServer.before(app) 里 app.use('/proxy', corsProxyMiddleware())
//   2) 自建 Express 服务器：app.use('/proxy', corsProxyMiddleware())
//   3) 纯 Node 服务器：把 /proxy* 请求交给 corsProxyMiddleware()(req, res)
//
// 支持两种 URL 写法：
//   /proxy?url=https%3A%2F%2Fexample.com%2Fx.sb3
//   /proxy/https%3A%2F%2Fexample.com%2Fx.sb3   （路径形式）
//
// 安全：作为开放代理存在 SSRF 风险，这里仅做基础防护（拦截回环/内网地址、
// 限制重定向次数与体积），正式上线请配合速率限制/鉴权/白名单使用。

const http = require('http');
const https = require('https');
const url = require('url');

const MAX_REDIRECTS = 5;
const MAX_SIZE = 200 * 1024 * 1024; // 200MB 上限，避免被当作放大攻击跳板

// 基础 SSRF 防护：拦截明显的回环 / 内网地址
const isBlockedHost = (hostname) => {
    const h = String(hostname || '').toLowerCase();
    if (!h) return true;
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
        return true;
    }
    const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
        const a = +m[1];
        const b = +m[2];
        const c = +m[3];
        const d = +m[4];
        if (a > 255 || b > 255 || c > 255 || d > 255) return true;
        if (a === 0 || a === 127 || a === 10) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 169 && b === 254) return true;
    }
    return false;
};

// 服务端去拉远程资源，整块缓冲后返回 {buffer, statusCode, headers}
// 用「缓冲后一次性写出」而非 pipe，避免小响应（单 chunk）在 pipe 监听挂上前被
// 提前的 data 监听消费导致开头字节丢失（网易云 detail 这类小 JSON 会因此残缺）。
// extraHeaders: 可选，附加到出站请求（如网易云音频 CDN 需要的 Referer）
const fetchRemote = (targetUrl, redirectCount, extraHeaders) => new Promise((resolve, reject) => {
    // 与 Cloudflare Function 对齐：http:// 统一升级为 https://（网易云 CDN 常给 http 重定向）
    targetUrl = targetUrl.replace(/^http:\/\//i, 'https://');
    let parsed;
    try {
        parsed = new URL(targetUrl);
    } catch (e) {
        return reject(new Error('Invalid url'));
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
        method: 'GET',
        headers: Object.assign({
            'User-Agent': 'TW-CorsProxy/1.0',
            'Accept': '*/*'
        }, extraHeaders || {}),
        timeout: 30000
    };
    const req = lib.get(targetUrl, options, (res) => {
        // 跟随重定向
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            if (redirectCount >= MAX_REDIRECTS) {
                res.resume();
                return reject(new Error('Too many redirects'));
            }
            const next = new URL(res.headers.location, targetUrl).toString().replace(/^http:\/\//i, 'https://');
            res.resume();
            return resolve(fetchRemote(next, redirectCount + 1, extraHeaders));
        }
        if (res.statusCode >= 400) {
            res.resume();
            return reject(new Error(`Remote returned status ${res.statusCode}`));
        }
        // 整块缓冲 + 体积保护
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_SIZE) {
                res.destroy();
                return reject(new Error('Response too large'));
            }
            chunks.push(chunk);
        });
        res.on('end', () => resolve({
            buffer: Buffer.concat(chunks),
            statusCode: res.statusCode,
            headers: res.headers
        }));
        res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
    });
});

// ===== NetEase 网易云 weapi 加密 + 歌曲下载 =====
//
// 网易云旧的免费下载接口（/song/media/outer/url?id=.mp3、/api/song/enhance/player/url）
// 已失效：前者 302 到 404 页面，后者不登录返回 url:null。现代可用的是 weapi 加密接口
// /weapi/song/enhance/player/url/v1，需要把请求体用 NetEase 的 weapi 算法加密
// （AES-128-CBC 两层 + RSA 对随机密钥加密）。加密实现同时兼容 Node 与 Cloudflare
// Workers/Pages（均基于 WebCrypto + BigInt），以便 dev 代理、Worker、Pages Function 三端一致。
//
// 路由：/netease?id=<歌曲ID> → 返回该歌曲真实播放地址的音频流（同源、带 CORS 头）。

const NE_MODULUS = '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';
const NE_PUBKEY = '010001';
const NE_NONCE = '0CoJUm6Qyw8W8jud';
const NE_IV = '0102030405060708';
const NE_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const neCrypto = () => (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle)
    ? globalThis.crypto
    : (require('crypto').webcrypto);

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
    base = BigInt(base);
    exp = BigInt(exp);
    mod = BigInt(mod);
    let result = 1n;
    base = base % mod;
    while (exp > 0n) {
        if (exp % 2n === 1n) result = (result * base) % mod;
        exp = exp / 2n;
        base = (base * base) % mod;
    }
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

// /netease?id=<歌曲ID> → 拉取真实播放地址并流式返回音频
async function handleNetease (req, res) {
    const u = new URL(req.url, 'http://localhost');
    const id = u.searchParams.get('id');
    if (!id || !/^\d+$/.test(id)) {
        res.statusCode = 400;
        res.end('Missing or invalid id');
        return;
    }
    try {
        const body = await neWeapi({ids: `[${id}]`, level: 'standard', encodeType: 'mp3', csrf_token: ''});
        const payload = `params=${encodeURIComponent(body.params)}&encSecKey=${encodeURIComponent(body.encSecKey)}`;
        const apiRes = await fetch('https://music.163.com/weapi/song/enhance/player/url/v1?csrf_token=', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://music.163.com/'
            },
            body: payload
        });
        if (!apiRes.ok) {
            res.statusCode = 502;
            res.end(`NetEase API error: HTTP ${apiRes.status}`);
            return;
        }
        const json = await apiRes.json();
        const song = json && json.data && json.data[0];
        if (!song || !song.url) {
            res.statusCode = 502;
            res.end('网易云未返回可播放地址：该歌曲可能需要登录网易云账号，或在本地区/网络下不可用。' +
                '建议改用「上传声音」直接导入本地音频文件。');
            return;
        }
        // 下载真实音频并流式返回（网易云 CDN 可能给 http 重定向，统一跟随并升级 https）
        const audioRes = await fetch(String(song.url).replace(/^http:\/\//i, 'https://'), {
            redirect: 'follow',
            headers: {'User-Agent': 'Mozilla/5.0', 'Referer': 'https://music.163.com/'}
        });
        if (!audioRes.ok) {
            res.statusCode = 502;
            res.end(`Failed to fetch audio: HTTP ${audioRes.status}`);
            return;
        }
        res.statusCode = 200;
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', audioRes.headers.get('content-type') || 'audio/mpeg');
        const cl = audioRes.headers.get('content-length');
        if (cl) res.setHeader('Content-Length', cl);
        const buf = Buffer.from(await audioRes.arrayBuffer());
        res.end(buf);
    } catch (e) {
        if (!res.headersSent) {
            res.statusCode = 502;
            res.end(`NetEase proxy error: ${e && e.message ? e.message : String(e)}`);
        }
    }
}

const extractTarget = (reqUrl) => {
    const parsed = url.parse(reqUrl, true);
    let target = parsed.query && parsed.query.url;
    if (!target) {
        // 路径形式：/proxy/<encoded> 或 /proxy/https://...
        const after = parsed.pathname.replace(/^\/proxy\/?/, '');
        target = decodeURIComponent(after);
    }
    // 重要：url.parse(..., true) 会把 %5B/%5D 解码成 [ ]。若原样转发，
    // 网易云 detail 接口（ids=[...]）等方法会因原始方括号返回空响应。
    // 转发前把 [ ] 重新编码回 %5B/%5D，保证上游收到与客户端一致的链接。
    if (target) {
        target = target.replace(/\[/g, '%5B').replace(/\]/g, '%5D');
    }
    return {target, referer: parsed.query && parsed.query.referer};
};

const corsProxyMiddleware = () => (req, res) => {
    // 网易云歌曲下载走专用端点（weapi 加密），与通用 /proxy 分开
    if (req.url && req.url.startsWith('/netease')) {
        return handleNetease(req, res);
    }
    // 处理 CORS 预检（同源下通常不需要，但保留以兼容将来代理真正的跨域 XHR）
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.statusCode = 204;
        res.end();
        return;
    }
    if (req.method !== 'GET') {
        res.statusCode = 405;
        res.end('Method not allowed');
        return;
    }

    const {target, referer} = extractTarget(req.url);
    if (!target || !/^https?:\/\//i.test(target)) {
        res.statusCode = 400;
        res.end('Missing or invalid url');
        return;
    }

    let parsedTarget;
    try {
        parsedTarget = new URL(target);
    } catch (e) {
        res.statusCode = 400;
        res.end('Invalid url');
        return;
    }
    if (isBlockedHost(parsedTarget.hostname)) {
        res.statusCode = 403;
        res.end('Blocked host');
        return;
    }

    const extraHeaders = {};
    if (referer && /^https?:\/\//i.test(referer)) {
        extraHeaders.Referer = referer;
    }

    fetchRemote(parsedTarget.toString(), 0, extraHeaders)
        .then((remote) => {
            // 远程返回 HTML（错误页 / 登录页 / 防盗链页）时，不要把它当作品
            // 传回浏览器——否则前端 VM 解析会抛出难懂的 "is not valid JSON"。
            const ct = (remote.headers['content-type'] || '').toLowerCase();
            if (ct.includes('text/html')) {
                res.statusCode = 502;
                res.end('Remote returned an HTML page instead of a project file. ' +
                    'The URL may require authentication, block hotlinking, ' +
                    'or the file does not exist.');
                return;
            }
            res.statusCode = remote.statusCode;
            const passHeaders = [
                'content-type', 'content-length', 'content-encoding',
                'cache-control', 'last-modified', 'etag', 'accept-ranges'
            ];
            passHeaders.forEach((h) => {
                const v = remote.headers[h];
                if (v) res.setHeader(h, v);
            });
            // 关键：让任何来源的页面都能用这个同源代理
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            // 整块写出（已在 fetchRemote 中缓冲），避免 stream pipe 竞态丢字节
            res.end(remote.buffer);
        })
        .catch((err) => {
            if (!res.headersSent) {
                res.statusCode = 502;
                res.end(`Proxy error: ${err.message}`);
            }
        });
};

module.exports = {
    corsProxyMiddleware,
    fetchRemote,
    isBlockedHost,
    handleNetease
};
