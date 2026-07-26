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
 * deployed: 2026-07-26 (v2, try/catch + timeout)
 */

const ALLOWED_SCHEMES = ['http:', 'https:'];
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 20000;

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
