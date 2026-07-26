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
 */

const ALLOWED_SCHEMES = ['http:', 'https:'];
const MAX_REDIRECTS = 5;

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
    const {request} = context;

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

    let current = target;
    let res;
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
        // 手动跟随重定向，保留 Referer（避免跨域重定向被浏览器/undici 剥离）
        res = await fetch(current, {
            method: 'GET',
            headers,
            redirect: 'manual'
        });
        if (res.status >= 300 && res.status < 400) {
            const loc = res.headers.get('location');
            if (!loc) break;
            current = new URL(loc, current).toString();
            continue;
        }
        break;
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
}
