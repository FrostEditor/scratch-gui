/**
 * tw-code-text-format.js
 * 纯文本格式（无 VM / 浏览器依赖）：积木「可读代码」文本 <-> 节点树 的互转。
 * 与 tw-code-text.js 分离，便于独立单元测试。
 */

export const INDENT_UNIT = '    ';

export function quote (s) {
    return '"' + String(s)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r') + '"';
}

export function unquote (s) {
    s = s.slice(1, -1);
    return s
        .replace(/\\r/g, '\r')
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
}

export function splitTopLevel (s) {
    const res = [];
    let depth = 0;
    let inStr = false;
    let cur = '';
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '"' && s[i - 1] !== '\\') {
            inStr = !inStr;
            cur += c;
        } else if (!inStr && c === '(') {
            depth++;
            cur += c;
        } else if (!inStr && c === ')') {
            depth--;
            cur += c;
        } else if (!inStr && depth === 0 && c === ',') {
            res.push(cur);
            cur = '';
        } else {
            cur += c;
        }
    }
    if (cur.trim() !== '' || res.length > 0) res.push(cur);
    return res;
}

export function parseArg (tok) {
    tok = tok.trim();
    if (tok === '' || tok === '_') return {t: 'empty'};
    if (tok.startsWith('(')) return {t: 'block', node: parseNode(tok.slice(1, -1))};
    if (tok.startsWith('"')) return {t: 'str', v: unquote(tok)};
    if (tok.startsWith('@')) return {t: 'var', v: tok.slice(1)};
    if (/^-?\d+(\.\d+)?$/.test(tok)) return {t: 'num', v: parseFloat(tok)};
    return {t: 'str', v: tok};
}

export function parseNode (s) {
    s = s.trim();
    let m = s.match(/^([A-Za-z_][\w]*)\s*\((.*)\)$/s);
    if (m) {
        const name = m[1];
        const inner = m[2];
        const args = inner.trim() === '' ? [] : splitTopLevel(inner).map(parseArg);
        return {name, args, _branches: []};
    }
    m = s.match(/^([A-Za-z_][\w]*)$/);
    if (m) return {name: m[1], args: [], _branches: []};
    return {name: s, args: [], _branches: []};
}

export function parseLevel (lines, idx, indent) {
    const nodes = [];
    while (idx < lines.length && lines[idx].indent === indent) {
        const line = lines[idx];
        const raw = line.content;
        // `else:` 是前一个容器(if-else)的第二个分支，不是独立节点
        const isContainer = raw.endsWith(':') && raw !== 'else:';
        const base = isContainer ? raw.slice(0, -1) : raw;
        const node = parseNode(base);
        idx++;
        if (isContainer) {
            const group = [];
            while (idx < lines.length && lines[idx].indent > indent) {
                const sub = parseLevel(lines, idx, lines[idx].indent);
                group.push(...sub.nodes);
                idx = sub.idx;
            }
            node._branches.push(group);
            // 同缩进的 else: 作为第二个分支
            if (idx < lines.length && lines[idx].indent === indent && lines[idx].content === 'else:') {
                idx++;
                const elseGroup = [];
                while (idx < lines.length && lines[idx].indent > indent) {
                    const sub = parseLevel(lines, idx, lines[idx].indent);
                    elseGroup.push(...sub.nodes);
                    idx = sub.idx;
                }
                node._branches.push(elseGroup);
            }
        }
        nodes.push(node);
    }
    return {nodes, idx};
}

export function parseTextToNodes (text) {
    const lines = text.split('\n').map(l => {
        const mm = l.match(/^(\s*)(.*)$/);
        const indent = mm[1].replace(/\t/g, INDENT_UNIT).length;
        return {indent, content: mm[2].trim()};
    }).filter(l => l.content !== '');
    const {nodes} = parseLevel(lines, 0, 0);
    return nodes;
}

export function argToText (arg) {
    if (!arg) return '_';
    switch (arg.t) {
    case 'num': return String(arg.v);
    case 'str': return quote(arg.v);
    case 'var': return '@' + arg.v;
    case 'list': return '@' + arg.v;
    case 'empty': return '_';
    case 'block': return '(' + nodeToText(arg.node) + ')';
    default: return '_';
    }
}

export function nodeToText (node, indentLevel) {
    const argsStr = (node.args || []).map(argToText).join(', ');
    let line = node.name + '(' + argsStr + ')';
    const isContainer = node._branches && node._branches.length > 0;
    if (isContainer) line += ':';
    const out = [INDENT_UNIT.repeat(indentLevel) + line];

    if (isContainer) {
        node._branches.forEach((children, bi) => {
            if (bi > 0) {
                out.push(INDENT_UNIT.repeat(indentLevel) + INDENT_UNIT + 'else:');
            }
            (children || []).forEach(child => {
                out.push(nodeToText(child, indentLevel + 1 + (bi > 0 ? 1 : 0)));
            });
        });
    }
    return out.join('\n');
}

export function nodesToText (nodes) {
    return nodes.map(n => nodeToText(n, 0)).join('\n\n') + '\n';
}
