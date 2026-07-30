/**
 * 扩展库元数据本地缓存 + 启动预加载。
 *
 * - 4 个源（TurboWarp / AstraEditor / UDBBS / FrostEditor）的原始元数据 JSON
 *   存入 localStorage，开面板时同步读取 → 秒开，不依赖远端网络。
 * - 应用启动阶段即在后台拉取并写入缓存（见 extension-library.jsx 模块底部
 *   调用的 refreshAll），用户打开面板时缓存已热。
 * - 后台静默刷新（默认 30 分钟 TTL）；刷新失败则保留旧缓存（即便已过期），
 *   因此离线也能用上一次成功加载的数据。
 * - 内存镜像 + inflight Promise 去重，避免重复网络请求。
 *
 * 注意：缓存的是「原始 JSON」，不是转换后的卡片对象——因为卡片里含 React
 * 元素（credits 的 <a>），无法 JSON 序列化。转换（raw → 卡片）在
 * extension-library.jsx 读取时做。
 */

const VERSION = 1;
const PREFIX = 'frost-ext-meta:';
const TTL = 30 * 60 * 1000; // 30 分钟

const memoryCache = {tw: null, astra: null, udbbs: null, frost: null};
const inflight = {};
const listeners = new Set();
let rawFetchers = {};

const key = source => `${PREFIX}${source}:v${VERSION}`;

function notify () {
    listeners.forEach(cb => {
        try {
            cb();
        } catch (e) {
            // 忽略单个订阅者的错误
        }
    });
}

export function subscribe (cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

function readStore (source) {
    try {
        const raw = localStorage.getItem(key(source));
        if (!raw) return null;
        const obj = JSON.parse(raw);
        return (obj && typeof obj === 'object' && Array.isArray(obj.data)) ? obj : null;
    } catch (e) {
        return null;
    }
}

function writeStore (source, data) {
    memoryCache[source] = data;
    try {
        localStorage.setItem(key(source), JSON.stringify({
            ts: Date.now(),
            data
        }));
    } catch (e) {
        // 配额超限 / 隐私模式：降级为仅内存缓存
    }
}

export function getMetadata (source) {
    if (memoryCache[source]) return memoryCache[source];
    const obj = readStore(source);
    if (obj) {
        memoryCache[source] = obj.data;
        return obj.data;
    }
    return null;
}

export function registerRawFetchers (map) {
    rawFetchers = Object.assign({}, rawFetchers, map);
}

export async function refreshSource (source, {force = false} = {}) {
    if (inflight[source]) return inflight[source];
    const store = readStore(source);
    if (!force && store && (Date.now() - store.ts) <= TTL) {
        // 缓存新鲜：确保内存有值即可，跳过网络
        if (!memoryCache[source]) memoryCache[source] = store.data;
        return store.data;
    }
    inflight[source] = (async () => {
        try {
            const fetcher = rawFetchers[source];
            if (!fetcher) return memoryCache[source];
            const data = await fetcher();
            writeStore(source, data);
            notify();
            return data;
        } catch (e) {
            // 网络失败：保留旧缓存（即便已过期），离线也能用
            const existing = getMetadata(source);
            if (existing) notify();
            return existing;
        } finally {
            delete inflight[source];
        }
    })();
    return inflight[source];
}

export async function refreshAll (force) {
    return Promise.all([
        refreshSource('tw', {force}),
        refreshSource('astra', {force}),
        refreshSource('udbbs', {force}),
        refreshSource('frost', {force})
    ]);
}
