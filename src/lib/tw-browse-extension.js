/**
 * 从扩展 JS 的 URL（或内置扩展 id）加载扩展，并返回它提供的积木定义。
 *
 * 这是「从 URL 浏览扩展积木」的可复用接口（interface），同时被两处使用：
 *   1. 编辑器内扩展库卡片上的「Browse blocks」按钮（见 containers/extension-library.jsx）
 *   2. 独立页面 playground/browse-extension.jsx（类似 embed 的独立入口）
 *
 * 注意：本函数要求传入的 vm 已经和 scratch-blocks 引擎建立好桥接
 * （即编辑器 GUI 已挂载，blocks.jsx 已初始化 scratch-blocks）。
 * 加载完成后，积木的视觉定义会由 GUI 的 blocks.jsx 在监听 EXTENSION_ADDED
 * 时自动注册到全局 scratch-blocks 上。
 *
 * @param {VM} vm scratch-vm 实例（必须已接入 scratch-blocks 桥接）
 * @param {string} urlOrId 扩展编译后 JS 的 URL，或内置扩展 id
 * @param {object} [opts] 可选配置
 * @param {string} [opts.name] 可选的显示名称覆盖
 * @param {boolean} [opts.allowReload=true] 若扩展已加载，是否允许重新加载
 * @returns {Promise<{id: string, name: string, blocks: Array, url: string}>}
 *   blocks 为 runtime._blockInfo 中每个积木对象（含 .xml 字段）
 */
export default async function browseExtensionBlocks (vm, urlOrId, opts = {}) {
    if (!vm || !vm.extensionManager || !vm.runtime) {
        throw new Error('browseExtensionBlocks 需要一个有效的 vm 实例');
    }

    const extensionManager = vm.extensionManager;
    const runtime = vm.runtime;
    const allowReload = opts.allowReload !== false;

    const isUrl = /^[a-z]+:\/\//i.test(urlOrId) || urlOrId.startsWith('//');
    const url = urlOrId; // 内置 id 会原样透传给 loadExtensionURL

    const grabBlocksById = id => {
        if (runtime._blockInfo && Array.isArray(runtime._blockInfo)) {
            const info = runtime._blockInfo.find(i => i.id === id);
            return info ? (info.blocks || []) : [];
        }
        return [];
    };

    // 加载前快照所有已存在 id，加载后通过差集找出「刚刚加入」的扩展条目。
    // 对于 URL 扩展，其 _blockInfo.id 可能与传入的 URL 不同，必须靠差集定位。
    const beforeIds = new Set(
        (runtime._blockInfo) ? runtime._blockInfo.map(i => i.id) : []
    );

    // 若已加载且不允许重载，则直接复用现有积木，不再 load。
    if (!allowReload && isUrl && extensionManager.isExtensionURLLoaded &&
        extensionManager.isExtensionURLLoaded(url)) {
        // 直接从 _blockInfo 中取（URL 扩展的 id 通常是规范化后的 URL）。
        const blocks = grabBlocksById(url);
        const info = (runtime._blockInfo || []).find(i => i.id === url);
        return {
            id: url,
            name: opts.name || (info && info.name) || url,
            blocks,
            url
        };
    }

    await extensionManager.loadExtensionURL(url);

    let loadedId = null;
    if (runtime._blockInfo) {
        const added = runtime._blockInfo.filter(i => !beforeIds.has(i.id));
        if (added.length) {
            loadedId = added[added.length - 1].id;
        }
    }

    let blocks = loadedId ? grabBlocksById(loadedId) : [];
    if (blocks.length === 0 && loadedId) {
        // 兜底：按积木 type 前缀匹配（加载时 id 可能被改写）。
        const info = runtime._blockInfo.find(i =>
            i.blocks && i.blocks.some(b =>
                b.info && b.info.opcode && b.info.opcode.startsWith(`${loadedId}_`)));
        blocks = info ? (info.blocks || []) : [];
    }

    let name = opts.name || loadedId || urlOrId;
    if (loadedId && runtime._blockInfo) {
        const info = runtime._blockInfo.find(i => i.id === loadedId);
        if (info && info.name) {
            name = info.name;
        }
    }

    return {
        id: loadedId || urlOrId,
        name,
        blocks,
        url: urlOrId
    };
}
