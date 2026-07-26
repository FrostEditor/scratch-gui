// FrostEditor 同源 CORS 代理 —— 独立 Cloudflare Worker 版
//
// 为什么要独立成 Worker：
//   GUI 的「网易云歌曲」等功能请求相对地址 /proxy?url=...&referer=...。
//   之前该代理放在 Cloudflare Pages Functions（functions/proxy.js），但它和
//   主站 webpack 构建绑定在一起 —— 主站构建一失败，整个部署被回滚，连 Function
//   也不更新，于是线上 /proxy 一直跑着旧崩溃版，浏览器侧表现为 “Failed to fetch”。
//   独立成 Worker 后，部署只依赖这一个 JS 文件，不再受 webpack 构建影响。
//
// 路由：部署到 editor.froste.top/proxy* ，与 GUI 的 fetch('/proxy?...') 同源，
//       因此无需改 GUI 代码，直接无缝替换 Pages Function。
//
// 逻辑与 src/lib/tw-cors-proxy.js 保持一致：
//   - http:// 统一升级 https://（网易云 CDN 常给 http 重定向）
//   - 手动跟随重定向（redirect: manual），避免 Worker 自动跟随 http 跳转被拦
//   - 透传网易云需要的 Referer
//   - 拦截远程返回的 HTML（错误页/登录页/防盗链页），避免被当成资源
//   - 基础 SSRF 防护（拦截回环/内网主机名）
//   - 全量 try/catch，异常返回可读业务错误而非让边缘吞掉

const MAX_REDIRECTS = 5;

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
        if (a > 255 || b > 255 || m[3] > 255 || m[4] > 255) return true;
        if (a === 0 || a === 127 || a === 10) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 169 && b === 254) return true;
    }
    return false;
};

// 手动跟随重定向：用 redirect: manual 拿到 Location 再自己 fetch，
// 并在跳转时把 http:// 升级成 https://（Worker 子请求更偏好 https）。
const followRedirects = async (targetUrl, headers, depth) => {
    const resp = await fetch(targetUrl, {
        method: 'GET',
        headers,
        redirect: 'manual'
    });
    const status = resp.status;
    if ([301, 302, 303, 307, 308].includes(status)) {
        const loc = resp.headers.get('location');
        if (!loc) {
            throw new Error(`Remote returned ${status} without Location`);
        }
        if (depth >= MAX_REDIRECTS) {
            throw new Error('Too many redirects');
        }
        const next = new URL(loc, targetUrl).toString().replace(/^http:\/\//i, 'https://');
        return followRedirects(next, headers, depth + 1);
    }
    if (status >= 400) {
        throw new Error(`Remote returned status ${status}`);
    }
    return resp;
};

export default {
    async fetch(request, env, ctx) {
        try {
            if (request.method === 'OPTIONS') {
                return new Response(null, {
                    status: 204,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, OPTIONS'
                    }
                });
            }
            if (request.method !== 'GET') {
                return new Response('Method not allowed', {status: 405});
            }

            const url = new URL(request.url);
            const target = url.searchParams.get('url');
            const referer = url.searchParams.get('referer');
            if (!target || !/^https?:\/\//i.test(target)) {
                return new Response('Missing or invalid url', {status: 400});
            }

            // 转发前把 [ ] 重新编码回 %5B/%5D（网易云 detail 接口 ids=[...] 需要）
            let targetUrl = target
                .replace(/^http:\/\//i, 'https://')
                .replace(/\[/g, '%5B')
                .replace(/\]/g, '%5D');

            const parsed = new URL(targetUrl);
            if (isBlockedHost(parsed.hostname)) {
                return new Response('Blocked host', {status: 403});
            }

            const headers = {
                'User-Agent': 'TW-CorsProxy/1.0',
                'Accept': '*/*'
            };
            if (referer && /^https?:\/\//i.test(referer)) {
                headers.Referer = referer;
            }

            const remote = await followRedirects(targetUrl, headers, 0);

            const ct = (remote.headers.get('content-type') || '').toLowerCase();
            if (ct.includes('text/html')) {
                return new Response(
                    'Remote returned an HTML page instead of a resource. ' +
                    'The URL may require authentication, block hotlinking, or not exist.',
                    {status: 502}
                );
            }

            const out = new Response(remote.body, remote);
            out.headers.set('Access-Control-Allow-Origin', '*');
            out.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
            return out;
        } catch (e) {
            const cause = e && e.cause ? (e.cause.message || String(e.cause)) : 'none';
            const msg = `Proxy error: ${e && e.message ? e.message : String(e)} | cause: ${cause}`;
            return new Response(msg, {status: 502});
        }
    }
};
