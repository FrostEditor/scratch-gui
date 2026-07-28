/* eslint-disable */
import JSZip from 'jszip';

// 统计一个项目对象（SB3 的 project.json 或 SB2 的根对象）里的积木总数。
function countBlocksInProjectObject (project) {
    let total = 0;
    // SB3：targets[].blocks 是数组，每一项是一个积木
    if (project && Array.isArray(project.targets)) {
        for (const target of project.targets) {
            if (target && Array.isArray(target.blocks)) {
                total += target.blocks.length;
            }
        }
        return total;
    }
    // SB2：根对象的 scripts 是一棵 blocks 树，递归统计
    if (project && Array.isArray(project.scripts)) {
        const walk = node => {
            if (!node || typeof node !== 'object') return;
            // 一个积木节点通常是数组或带 opcode/cmd 的对象
            if (Array.isArray(node)) {
                // [cmd, ...args] 形式，第一个是命令名
                if (typeof node[0] === 'string') total += 1;
                for (const child of node) walk(child);
            } else if (node.children) {
                for (const child of node.children) walk(child);
            }
        };
        for (const script of project.scripts) walk(script);
        return total;
    }
    return total;
}

// 从 vm.loadProject 传入的数据（ArrayBuffer / JSON 字符串 / 对象）统计积木总数。
// 返回 number（统计失败返回 null）。
export async function countProjectBlocks (data) {
    let project = null;
    try {
        if (data == null) {
            return null;
        } else if (data instanceof ArrayBuffer) {
            const bytes = new Uint8Array(data);
            // SB3 是 zip，以 'PK' (0x50 0x4B) 开头
            if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
                const zip = await JSZip.loadAsync(data);
                const file = zip.file('project.json');
                if (file) {
                    const text = await file.async('string');
                    project = JSON.parse(text);
                }
            } else {
                // 退化为 JSON 字符串
                const text = new TextDecoder().decode(bytes);
                project = JSON.parse(text);
            }
        } else if (typeof data === 'string') {
            project = JSON.parse(data);
        } else if (typeof data === 'object') {
            project = data;
        }
    } catch (e) {
        return null;
    }
    if (!project) return null;
    const total = countBlocksInProjectObject(project);
    return Number.isFinite(total) ? total : null;
}

export default countProjectBlocks;
