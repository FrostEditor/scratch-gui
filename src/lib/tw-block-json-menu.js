/**
 * tw：积木区右键菜单 —— 复制当前积木列为 JSON / 粘贴 JSON
 *
 * 通过 monkey-patch `ScratchBlocks.ContextMenu.show` 注入两个菜单项：
 *   - 复制为 JSON：把右键所在积木所在的整列（从根积木起）序列化成 JSON，
 *                  写入剪贴板（如可用）并备份到 localStorage。
 *   - 粘贴 JSON：从剪贴板（兜底 localStorage）读取 JSON，反序列化为积木并粘贴到鼠标位置。
 *
 * 序列化基于 scratch-blocks 自带的 `Xml.blockToDom` / `Xml.textToDom` /
 * `Xml.domToWorkspace`，在 XML 与 JSON 之间做无损转换，不依赖任何外部依赖。
 */

let patchedInstance = null;

// ---- 小工具：屏幕坐标 → 工作区坐标 ----
const getWorkspace = ScratchBlocks =>
    (ScratchBlocks.getMainWorkspace ? ScratchBlocks.getMainWorkspace() : ScratchBlocks.mainWorkspace);

const clientToWorkspaceCoords = (workspace, event) => {
    const metrics = workspace.getMetrics();
    const x = (event.clientX - (metrics.absoluteLeft || 0)) + (metrics.viewLeft || 0);
    const y = (event.clientY - (metrics.absoluteTop || 0)) + (metrics.viewTop || 0);
    return {x, y};
};

// ---- XML <-> JSON 转换（保留 tag / attributes / children / text） ----
const xmlToJson = el => {
    const obj = {tag: el.tagName.toLowerCase()};
    if (el.attributes && el.attributes.length) {
        obj.attributes = {};
        for (let i = 0; i < el.attributes.length; i++) {
            const a = el.attributes[i];
            obj.attributes[a.name] = a.value;
        }
    }
    const children = [];
    const nodes = el.childNodes;
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.nodeType === 1) {
            children.push(xmlToJson(node));
        } else if (node.nodeType === 3) {
            const t = (node.textContent || '').trim();
            if (t) obj.text = t;
        }
    }
    if (children.length) obj.children = children;
    return obj;
};

const escapeXml = s => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const jsonToXmlString = obj => {
    let s = `<${obj.tag}`;
    if (obj.attributes) {
        for (const k in obj.attributes) {
            if (k === 'id') continue; // 粘贴时让 Blockly 重新生成 id，避免重复
            s += ` ${k}="${escapeXml(obj.attributes[k])}"`;
        }
    }
    s += '>';
    if (obj.text) s += escapeXml(obj.text);
    if (obj.children) {
        for (const c of obj.children) s += jsonToXmlString(c);
    }
    s += `</${obj.tag}>`;
    return s;
};

// 递归移除 id 属性（复制时也移除，避免同一积木出现两份相同 id）
const stripIds = el => {
    if (el.removeAttribute) el.removeAttribute('id');
    const kids = el.childNodes;
    for (let i = 0; i < kids.length; i++) {
        if (kids[i].nodeType === 1) stripIds(kids[i]);
    }
};

// ---- 轻量 toast 提示 ----
let toastTimer = null;
const showToast = message => {
    let el = document.getElementById('tw-block-json-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'tw-block-json-toast';
        el.style.cssText = 'position:fixed;left:50%;bottom:48px;transform:translateX(-50%);' +
            'background:rgba(0,0,0,0.85);color:#fff;padding:10px 18px;border-radius:8px;' +
            'font-size:14px;z-index:100000;pointer-events:none;font-family:inherit;' +
            'transition:opacity .2s;opacity:0;';
        document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.opacity = '1';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        el.style.opacity = '0';
    }, 1600);
};

// ---- 复制当前积木列为 JSON ----
const copyBlockStackAsJson = (ScratchBlocks, block) => {
    try {
        const root = block.getRootBlock();
        const dom = ScratchBlocks.Xml.blockToDom(root);
        const xy = root.getRelativeToSurfaceXY();
        dom.setAttribute('x', Math.round(xy.x));
        dom.setAttribute('y', Math.round(xy.y));
        stripIds(dom);
        const json = xmlToJson(dom);
        const text = JSON.stringify(json, null, 2);

        try {
            localStorage.setItem('tw-block-json-clipboard', text);
        } catch (e) {
            // ignore
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => {});
        }
        showToast('已复制为 JSON');
    } catch (e) {
        showToast('复制失败：' + (e.message || e));
    }
};

// ---- 粘贴 JSON 为积木 ----
const pasteBlockStackFromJson = async (ScratchBlocks, event) => {
    let text = null;
    if (navigator.clipboard && navigator.clipboard.readText) {
        try {
            text = await navigator.clipboard.readText();
        } catch (e) {
            // 剪贴板读不到（权限/不支持），继续走 localStorage 兜底
        }
    }
    if (!text || text.trim().charAt(0) !== '{') {
        try {
            text = localStorage.getItem('tw-block-json-clipboard');
        } catch (e) {
            // ignore
        }
    }
    if (!text || text.trim().charAt(0) !== '{') {
        showToast('没有可用的积木 JSON');
        return;
    }

    let json;
    try {
        json = JSON.parse(text);
    } catch (e) {
        showToast('JSON 解析失败');
        return;
    }

    const workspace = getWorkspace(ScratchBlocks);
    if (!workspace) {
        showToast('找不到工作区');
        return;
    }

    let dom;
    try {
        const xmlString = `<xml>${jsonToXmlString(json)}</xml>`;
        dom = ScratchBlocks.Xml.textToDom(xmlString);
    } catch (e) {
        showToast('生成积木失败：' + (e.message || e));
        return;
    }

    let newBlocks = [];
    try {
        newBlocks = ScratchBlocks.Xml.domToWorkspace(dom, workspace);
    } catch (e) {
        showToast('粘贴失败：' + (e.message || e));
        return;
    }

    if (newBlocks && newBlocks.length) {
        const pos = clientToWorkspaceCoords(workspace, event);
        const top = newBlocks[0];
        const cur = top.getRelativeToSurfaceXY ? top.getRelativeToSurfaceXY() : {x: 0, y: 0};
        if (typeof top.moveBy === 'function') {
            top.moveBy(pos.x - cur.x, pos.y - cur.y);
        }
    }
    showToast('已粘贴 JSON 积木');
};

export default function installBlockJsonMenu (ScratchBlocks) {
    if (patchedInstance === ScratchBlocks || !ScratchBlocks || !ScratchBlocks.ContextMenu) return;
    patchedInstance = ScratchBlocks;

    const oldShow = ScratchBlocks.ContextMenu.show;
    ScratchBlocks.ContextMenu.show = function (event, items, rtl) {
        const gesture = ScratchBlocks.mainWorkspace ? ScratchBlocks.mainWorkspace.currentGesture_ : null;
        const block = gesture ? gesture.targetBlock_ : null;
        const flyout = gesture ? gesture.flyout_ : false;

        const extra = [];

        // 仅在点击真实积木（非积木库 flyout）时提供“复制为 JSON”
        if (block && !flyout && typeof block.getRootBlock === 'function') {
            extra.push({
                text: '复制为 JSON',
                enabled: true,
                callback: () => copyBlockStackAsJson(ScratchBlocks, block)
            });
        }

        // “粘贴 JSON” 始终提供（有数据才生效）
        extra.push({
            text: '粘贴 JSON',
            enabled: true,
            callback: () => pasteBlockStackFromJson(ScratchBlocks, event)
        });

        if (extra.length) {
            let newItems = items;
            if (newItems && newItems.length) {
                newItems = newItems.concat([{separator: true}]);
            }
            newItems = newItems.concat(extra);
            oldShow.call(this, event, newItems, rtl);
        } else {
            oldShow.call(this, event, items, rtl);
        }
    };
}
