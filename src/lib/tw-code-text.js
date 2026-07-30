/**
 * tw-code-text.js
 * ---------------------------------------------------------------------------
 * 把图形化积木「反编译」成可读的文本代码，并支持把文本代码写回项目。
 * 同时提供 造型 / 声音 / 作品说明 的纯文本（JSON / 文本）编辑能力。
 *
 * 设计要点：
 *  - 文本格式为「缩进式 + 圆括号」的可读代码，例如：
 *
 *      whenGreenFlag:
 *        forever:
 *          move(10)
 *          turnRight(15)
 *          if(touchingMouse()):
 *            say("Hello!")
 *
 *  - 积木参数语法：
 *      数字          123 / 12.5
 *      字符串/菜单    "文本"
 *      变量/列表      @变量名
 *      积木(报告器)   (blockName(args))
 *      空(未连接)     _
 *  - 容器(帽子 / C形块) 以冒号结尾，其主体为缩进更深的多行；
 *    if-else 用 `else:` 行分隔两个分支。
 *  - 任意 opcode 都可被「通用形式」还原（用真实 opcode 作名字，按
 *    runtime._blockInfo 里的参数顺序解析），所以即使没有友好别名也能 100% 往返。
 *  - 友好别名(FRIENDLY)只是让它更可读，是可选的糖。
 * ---------------------------------------------------------------------------
 */

/* ----------------------------- 小工具 ----------------------------- */

let _uidCounter = 0;
function uid () {
    _uidCounter += 1;
    return `ct${Date.now().toString(36)}${_uidCounter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function quote (s) {
    return '"' + String(s)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r') + '"';
}

function unquote (s) {
    s = s.slice(1, -1);
    return s
        .replace(/\\r/g, '\r')
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
}

const INDENT_UNIT = '    ';

/* --------------------- 友好别名（可读层，可选） --------------------- */
// opcode -> 可读名。解析时反向匹配；未知 opcode 直接用 opcode 本身。
const FRIENDLY = {
    // events
    event_whenflagclicked: 'whenGreenFlag',
    event_whenkeypressed: 'whenKeyPressed',
    event_whenstageclicked: 'whenStageClicked',
    event_whenthisspriteclicked: 'whenSpriteClicked',
    event_whenbroadcastreceived: 'whenBroadcastReceived',
    event_broadcast: 'broadcast',
    event_broadcastandwait: 'broadcastAndWait',
    // control
    control_wait: 'wait',
    control_repeat: 'repeat',
    control_forever: 'forever',
    control_if: 'if',
    control_if_else: 'ifElse',
    control_repeat_until: 'repeatUntil',
    control_while: 'while',
    control_stop: 'stop',
    control_start_as_clone: 'whenStartedAsClone',
    control_create_clone_of: 'createCloneOf',
    control_delete_this_clone: 'deleteThisClone',
    // motion
    motion_movesteps: 'move',
    motion_turnright: 'turnRight',
    motion_turnleft: 'turnLeft',
    motion_goto: 'goTo',
    motion_gotoxy: 'goToXY',
    motion_glidesecstoxy: 'glide',
    motion_glideto: 'glideTo',
    motion_pointindirection: 'pointInDirection',
    motion_pointtowards: 'pointTowards',
    motion_changexby: 'changeX',
    motion_setx: 'setX',
    motion_changeyby: 'changeY',
    motion_sety: 'setY',
    motion_ifonedgebounce: 'ifOnEdgeBounce',
    motion_setrotationstyle: 'setRotationStyle',
    // looks
    looks_sayforsecs: 'say',
    looks_say: 'sayForever',
    looks_thinkforsecs: 'think',
    looks_think: 'thinkForever',
    looks_switchcostumeto: 'switchCostume',
    looks_nextcostume: 'nextCostume',
    looks_switchbackdropto: 'switchBackdrop',
    looks_nextbackdrop: 'nextBackdrop',
    looks_changeeffectby: 'changeEffect',
    looks_seteffectto: 'setEffect',
    looks_cleargraphiceffects: 'clearEffects',
    looks_show: 'show',
    looks_hide: 'hide',
    looks_changesizeby: 'changeSize',
    looks_setsizeto: 'setSize',
    looks_gotofrontback: 'goToLayer',
    looks_goforwardbackwardlayers: 'moveLayer',
    // sound
    sound_play: 'playSound',
    sound_playuntildone: 'playSoundUntilDone',
    sound_stopallsounds: 'stopAllSounds',
    sound_changeeffectby: 'changeSoundEffect',
    sound_seteffectto: 'setSoundEffect',
    sound_cleareffects: 'clearSoundEffects',
    sound_changevolumeby: 'changeVolume',
    sound_setvolumeto: 'setVolume',
    // sensing
    sensing_touchingobject: 'touching',
    sensing_touchingcolor: 'touchingColor',
    sensing_coloristouchingcolor: 'colorIsTouchingColor',
    sensing_askandwait: 'ask',
    sensing_answer: 'answer',
    sensing_keypressed: 'keyPressed',
    sensing_mousedown: 'mouseDown',
    sensing_mousex: 'mouseX',
    sensing_mousey: 'mouseY',
    sensing_timer: 'timer',
    sensing_resettimer: 'resetTimer',
    sensing_of: 'of',
    sensing_current: 'current',
    sensing_dayssince2000: 'daysSince2000',
    sensing_username: 'username',
    // operators
    operator_add: 'add',
    operator_subtract: 'subtract',
    operator_multiply: 'multiply',
    operator_divide: 'divide',
    operator_random: 'random',
    operator_gt: 'greaterThan',
    operator_lt: 'lessThan',
    operator_equals: 'equals',
    operator_and: 'and',
    operator_or: 'or',
    operator_not: 'not',
    operator_join: 'join',
    operator_letter_of: 'letterOf',
    operator_length: 'length',
    operator_contains: 'contains',
    operator_mod: 'mod',
    operator_round: 'round',
    operator_mathop: 'mathOp',
    // variables
    data_setvariableto: 'setVariable',
    data_changevariableby: 'changeVariable',
    data_showvariable: 'showVariable',
    data_hidevariable: 'hideVariable',
    // lists
    data_addtolist: 'listAdd',
    data_deleteoflist: 'listDelete',
    data_deletealloflist: 'listDeleteAll',
    data_insertatlist: 'listInsert',
    data_replaceitemoflist: 'listReplace',
    data_itemoflist: 'listItem',
    data_itemnumoflist: 'listItemNum',
    data_lengthoflist: 'listLength',
    data_listcontainsitem: 'listContains',
    data_showlist: 'showList',
    data_hidelist: 'hideList'
};

const FRIENDLY_REV = {};
Object.keys(FRIENDLY).forEach(op => {
    FRIENDLY_REV[FRIENDLY[op]] = op;
});

/* --------------------- 从 runtime 读取积木定义 --------------------- */

function getBlockDef (runtime, opcode) {
    if (!runtime || !runtime._blockInfo) return null;
    for (const ci of runtime._blockInfo) {
        if (!ci.blocks) continue;
        for (const b of ci.blocks) {
            if (b.info && b.info.opcode === opcode) {
                return normalizeDef(b.info);
            }
        }
    }
    return null;
}

function normalizeDef (info) {
    const args = info.arguments || {};
    const names = Object.keys(args);
    const branches = names.filter(n => /^SUBSTACK/.test(n));
    const inlineArgs = names.filter(n => !/^SUBSTACK/.test(n));
    const argType = {};
    names.forEach(n => {
        argType[n] = (args[n] && args[n].type) || 'input';
    });
    return {
        opcode: info.opcode,
        blockType: info.blockType,
        inlineArgs,
        branches,
        argType
    };
}

function isContainerDef (def) {
    if (!def) return false;
    if (def.blockType === 'hat') return true;
    return def.branches && def.branches.length > 0;
}

/* --------------------- 积木 -> 文本节点树 --------------------- */

// 把一个 shadow(字面量)积木转成 arg
function shadowToArg (child) {
    const op = child.opcode;
    if (op === 'math_number' || op === 'math_integer' || op === 'math_whole_number') {
        const v = child.fields && child.fields.NUM ? child.fields.NUM[0] : '0';
        return {t: 'num', v: Number(v)};
    }
    if (op === 'text') {
        const v = child.fields && child.fields.TEXT ? child.fields.TEXT[0] : '';
        return {t: 'str', v: String(v)};
    }
    if (op === 'data_variable') {
        const v = child.fields && child.fields.VARIABLE ? child.fields.VARIABLE[0] : '';
        return {t: 'var', v: String(v)};
    }
    if (op === 'data_listcontents') {
        const v = child.fields && child.fields.LIST ? child.fields.LIST[0] : '';
        return {t: 'list', v: String(v)};
    }
    // 菜单类 shadow：取第一个字段值
    if (child.fields) {
        const ks = Object.keys(child.fields);
        if (ks.length) {
            return {t: 'str', v: String(child.fields[ks[0]][0])};
        }
    }
    return {t: 'str', v: ''};
}

function inputToArg (runtime, block, name) {
    const inp = block.inputs && block.inputs[name];
    if (!inp || inp[1] == null) return {t: 'empty'};
    const child = runtime.blocks.getBlock(inp[1]);
    if (!child) return {t: 'empty'};
    if (child.shadow) return shadowToArg(child);
    return {t: 'block', node: blockToNode(runtime, inp[1])};
}

function fieldToArg (block, name) {
    const f = block.fields && block.fields[name];
    if (!f) return {t: 'str', v: ''};
    const value = f[0];
    if (name === 'VARIABLE') return {t: 'var', v: String(value)};
    if (name === 'LIST') return {t: 'list', v: String(value)};
    return {t: 'str', v: String(value)};
}

function blockToNode (runtime, blockId) {
    const block = runtime.blocks.getBlock(blockId);
    if (!block) return null;
    const def = getBlockDef(runtime, block.opcode);
    const name = FRIENDLY[block.opcode] || block.opcode;
    const node = {name, args: [], _branches: []};

    if (def) {
        def.inlineArgs.forEach(argName => {
            if (def.argType[argName] === 'field') {
                node.args.push(fieldToArg(block, argName));
            } else {
                node.args.push(inputToArg(runtime, block, argName));
            }
        });
        def.branches.forEach(branchName => {
            const branchNum = branchName === 'SUBSTACK' ? 1 : 2;
            let childId = runtime.blocks.getBranch(blockId, branchNum);
            const children = [];
            while (childId) {
                const cn = blockToNode(runtime, childId);
                if (cn) children.push(cn);
                childId = runtime.blocks.getNextBlock(childId);
            }
            node._branches.push(children);
        });
    } else {
        // 无定义时尽力而为：把 inputs 当 inline，fields 当 inline
        const inNames = block.inputs ? Object.keys(block.inputs) : [];
        const fNames = block.fields ? Object.keys(block.fields) : [];
        inNames.forEach(n => node.args.push(inputToArg(runtime, block, n)));
        fNames.forEach(n => node.args.push(fieldToArg(block, n)));
    }
    return node;
}

// 取编辑目标的所有顶层脚本（帽子），转成节点数组
function scriptsToNodes (runtime, targetId) {
    const nodes = [];
    const scripts = runtime.blocks.getScripts() || [];
    scripts.forEach(id => {
        const b = runtime.blocks.getBlock(id);
        if (!b) return;
        if (b.targetId !== targetId) return;
        const node = blockToNode(runtime, id);
        if (node) nodes.push(node);
    });
    return nodes;
}

/* --------------------- 文本节点树 -> 文本 --------------------- */

function argToText (arg) {
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

function nodeToText (node, indentLevel) {
    const indent = INDENT_UNIT.repeat(indentLevel);
    const def = null; // 文本里不存 def，靠名字解析
    const isContainer = node._branches && node._branches.length > 0;
    const argsStr = (node.args || []).map(argToText).join(', ');
    let line = node.name + '(' + argsStr + ')';
    if (isContainer) line += ':';
    let out = [indent + line];

    if (isContainer) {
        node._branches.forEach((children, bi) => {
            if (bi > 0) {
                // 第二个分支（if-else 的 else）
                out.push(indent + INDENT_UNIT + 'else:');
            }
            (children || []).forEach(child => {
                out.push(nodeToText(child, indentLevel + 1 + (bi > 0 ? 1 : 0)));
            });
        });
    }
    return out.join('\n');
}

function nodesToText (nodes) {
    return nodes.map(n => nodeToText(n, 0)).join('\n\n') + '\n';
}

/* --------------------- 文本 -> 文本节点树 --------------------- */

function splitTopLevel (s) {
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

function parseArg (tok) {
    tok = tok.trim();
    if (tok === '' || tok === '_') return {t: 'empty'};
    if (tok.startsWith('(')) return {t: 'block', node: parseNode(tok.slice(1, -1))};
    if (tok.startsWith('"')) return {t: 'str', v: unquote(tok)};
    if (tok.startsWith('@')) return {t: 'var', v: tok.slice(1)};
    if (/^-?\d+(\.\d+)?$/.test(tok)) return {t: 'num', v: parseFloat(tok)};
    return {t: 'str', v: tok}; // 菜单裸词兜底
}

function parseNode (s) {
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
    // 退化：整段当名字
    return {name: s, args: [], _branches: []};
}

function parseTextToNodes (text) {
    const lines = text.split('\n').map(l => {
        const mm = l.match(/^(\s*)(.*)$/);
        const indent = mm[1].replace(/\t/g, INDENT_UNIT).length;
        return {indent, content: mm[2].trim()};
    }).filter(l => l.content !== '');
    const {nodes} = parseLevel(lines, 0, 0);
    return nodes;
}

function parseLevel (lines, idx, indent) {
    const nodes = [];
    while (idx < lines.length && lines[idx].indent === indent) {
        const line = lines[idx];
        const raw = line.content;
        const isContainer = raw.endsWith(':');
        const base = isContainer ? raw.slice(0, -1) : raw;
        const node = parseNode(base);
        idx++;
        if (isContainer) {
            const groups = [];
            let cur = null;
            while (idx < lines.length && lines[idx].indent > indent) {
                if (lines[idx].content === 'else:') {
                    idx++;
                    cur = [];
                    groups.push(cur);
                    continue;
                }
                if (cur === null) {
                    cur = [];
                    groups.push(cur);
                }
                const sub = parseLevel(lines, idx, lines[idx].indent);
                cur.push(...sub.nodes);
                idx = sub.idx;
            }
            node._branches = groups;
        }
        nodes.push(node);
    }
    return {nodes, idx};
}

/* --------------------- 文本节点树 -> 写回 VM --------------------- */

function createShadow (runtime, target, arg, argName) {
    const id = uid();
    let block;
    if (arg.t === 'num') {
        block = {
            id, targetId: target.id, opcode: 'math_number',
            next: null, parent: null, inputs: {}, fields: {NUM: [String(arg.v), null]},
            mutation: null, topLevel: false, shadow: true, x: 0, y: 0
        };
    } else if (arg.t === 'list') {
        const v = target.lookupVariableByNameAndType(arg.v, 'list');
        block = {
            id, targetId: target.id, opcode: 'data_listcontents',
            next: null, parent: null, inputs: {}, fields: {LIST: [arg.v, v ? v.id : null]},
            mutation: null, topLevel: false, shadow: true, x: 0, y: 0
        };
    } else if (arg.t === 'var') {
        const v = target.lookupVariableByNameAndType(arg.v, '');
        block = {
            id, targetId: target.id, opcode: 'data_variable',
            next: null, parent: null, inputs: {}, fields: {VARIABLE: [arg.v, v ? v.id : null]},
            mutation: null, topLevel: false, shadow: true, x: 0, y: 0
        };
    } else {
        block = {
            id, targetId: target.id, opcode: 'text',
            next: null, parent: null, inputs: {}, fields: {TEXT: [String(arg.v), null]},
            mutation: null, topLevel: false, shadow: true, x: 0, y: 0
        };
    }
    runtime.blocks.createBlock(block);
    return id;
}

function createNode (runtime, target, node, parentId) {
    const opcode = FRIENDLY_REV[node.name] || node.name;
    const def = getBlockDef(runtime, opcode);
    if (!def) {
        throw new Error('不支持/未知的积木：' + node.name + '（尝试用真实 opcode 代替名字，如 motion_movesteps）');
    }
    const id = uid();
    const block = {
        id, targetId: target.id, opcode,
        next: null, parent: parentId || null,
        inputs: {}, fields: {}, mutation: node.mutation || null,
        topLevel: !parentId, shadow: false, x: 0, y: 0
    };

    def.inlineArgs.forEach((argName, i) => {
        const arg = node.args[i];
        if (!arg || arg.t === 'empty') return; // 断开的输入
        if (def.argType[argName] === 'field') {
            if (argName === 'VARIABLE') {
                const v = target.lookupVariableByNameAndType(arg.v, '');
                block.fields[argName] = [arg.v, v ? v.id : null];
            } else if (argName === 'LIST') {
                const v = target.lookupVariableByNameAndType(arg.v, 'list');
                block.fields[argName] = [arg.v, v ? v.id : null];
            } else {
                block.fields[argName] = [typeof arg.v === 'string' ? arg.v : String(arg.v), null];
            }
        } else {
            if (arg.t === 'block') {
                const childId = createNode(runtime, target, arg.node, id);
                block.inputs[argName] = [2, childId];
            } else {
                const shadowId = createShadow(runtime, target, arg, argName);
                block.inputs[argName] = [1, shadowId];
            }
        }
    });

    def.branches.forEach((bn, bi) => {
        const group = node._branches ? node._branches[bi] : null;
        if (!group || !group.length) return;
        let first = null;
        let prev = null;
        group.forEach(child => {
            const cid = createNode(runtime, target, child, id);
            if (!first) first = cid;
            if (prev) runtime.blocks.getBlock(prev).next = cid;
            prev = cid;
        });
        block.inputs[bn] = [2, first];
    });

    runtime.blocks.createBlock(block);
    return id;
}

function clearTargetBlocks (runtime, targetId) {
    const ids = [];
    const all = runtime.blocks._blocks;
    for (const id in all) {
        if (!Object.prototype.hasOwnProperty.call(all, id)) continue;
        const b = all[id];
        if (b.targetId === targetId && !b.shadow) ids.push(id);
    }
    // 先删叶子（有 next 的），再删父，避免悬空引用
    ids.sort((a, b) => {
        const ba = all[a];
        const bb = all[b];
        const aHasNext = !!(ba.next);
        const bHasNext = !!(bb.next);
        return (bHasNext ? 1 : 0) - (aHasNext ? 1 : 0);
    });
    ids.forEach(id => {
        try {
            runtime.blocks.deleteBlock(id);
        } catch (e) { /* ignore */ }
    });
}

function applyNodesToTarget (vm, nodes) {
    const runtime = vm.runtime;
    const target = vm.editingTarget;
    if (!target) throw new Error('没有选中的编辑对象');
    clearTargetBlocks(runtime, target.id);
    nodes.forEach(node => createNode(runtime, target, node, null));
    if (typeof runtime.emitProjectChanged === 'function') runtime.emitProjectChanged();
    if (typeof target.emitBlocksChanged === 'function') target.emitBlocksChanged();
}

/* --------------------- 对外：积木 ===================== */

export function serializeCode (vm) {
    const runtime = vm.runtime;
    const target = vm.editingTarget;
    if (!target) return '';
    return nodesToText(scriptsToNodes(runtime, target.id));
}

export function applyCode (vm, text) {
    const nodes = parseTextToNodes(text);
    applyNodesToTarget(vm, nodes);
}

/* --------------------- 对外：造型 ===================== */

export function serializeCostumes (vm) {
    const target = vm.editingTarget;
    if (!target) return '[]';
    const list = (target.getCostumes ? target.getCostumes() : (target.sprite && target.sprite.costumes) || [])
        .map(c => ({name: c.name}));
    return JSON.stringify(list, null, 2);
}

export function applyCostumes (vm, text) {
    const desired = JSON.parse(text);
    if (!Array.isArray(desired)) throw new Error('造型数据应为 JSON 数组');
    const target = vm.editingTarget;
    if (!target) throw new Error('没有选中的编辑对象');
    const current = target.getCostumes ? target.getCostumes() : (target.sprite && target.sprite.costumes) || [];
    // 重命名
    desired.forEach((d, i) => {
        if (current[i] && d.name != null && d.name !== current[i].name) {
            vm.renameCostume(i, String(d.name));
        }
    });
    // 按 desired 顺序重排（按名字匹配）
    const nameOrder = desired.map(d => String(d.name));
    nameOrder.forEach((name, toIdx) => {
        const fromIdx = current.findIndex(c => c.name === name);
        if (fromIdx !== -1 && fromIdx !== toIdx) {
            vm.reorderCostume(target.id, fromIdx, toIdx);
            // reorder 会改变 current 的索引，重算
            const refreshed = target.getCostumes ? target.getCostumes() : (target.sprite && target.sprite.costumes) || [];
            current.length = 0;
            refreshed.forEach(c => current.push(c));
        }
    });
}

/* --------------------- 对外：声音 ===================== */

export function serializeSounds (vm) {
    const target = vm.editingTarget;
    if (!target) return '[]';
    const list = (target.sounds || []).map(s => ({name: s.name}));
    return JSON.stringify(list, null, 2);
}

export function applySounds (vm, text) {
    const desired = JSON.parse(text);
    if (!Array.isArray(desired)) throw new Error('声音数据应为 JSON 数组');
    const target = vm.editingTarget;
    if (!target) throw new Error('没有选中的编辑对象');
    const current = target.sounds || [];
    desired.forEach((d, i) => {
        if (current[i] && d.name != null && d.name !== current[i].name) {
            vm.renameSound(i, String(d.name));
        }
    });
    const nameOrder = desired.map(d => String(d.name));
    nameOrder.forEach((name, toIdx) => {
        const fromIdx = current.findIndex(s => s.name === name);
        if (fromIdx !== -1 && fromIdx !== toIdx) {
            vm.reorderSound(target.id, fromIdx, toIdx);
            const refreshed = target.sounds || [];
            current.length = 0;
            refreshed.forEach(s => current.push(s));
        }
    });
}

/* --------------------- 对外：作品说明 ===================== */

export function serializeNotes () {
    try {
        return localStorage.getItem('projectStatement') || '';
    } catch (e) {
        return '';
    }
}

export function applyNotes (text) {
    try {
        localStorage.setItem('projectStatement', text);
    } catch (e) { /* ignore */ }
    // 通知 ProjectStatement 组件刷新
    try {
        const collab = require('../lib/collaboration/collaboration-manager.js').default;
        if (collab && typeof collab.emit === 'function') {
            collab.emit('statement-updated', {text});
        }
    } catch (e) { /* ignore */ }
}

/* --------------------- 模式分发 --------------------- */

export const MODES = {
    code: {label: '代码', serialize: serializeCode, apply: applyCode, lang: 'text', hint: '可读文本代码（缩进表示嵌套）。保存即写回当前角色/舞台的积木。'},
    costume: {label: '造型', serialize: serializeCostumes, apply: applyCostumes, lang: 'json', hint: 'JSON 数组，每项 { "name": "造型名" }。可改名 / 调整顺序。'},
    sound: {label: '声音', serialize: serializeSounds, apply: applySounds, lang: 'json', hint: 'JSON 数组，每项 { "name": "声音名" }。可改名 / 调整顺序。'},
    notes: {label: '作品说明', serialize: serializeNotes, apply: applyNotes, lang: 'text', hint: '作品说明纯文本。保存后即时写入本地。'}
};

export function serializeByMode (vm, mode) {
    const m = MODES[mode];
    if (!m) return '';
    return m.serialize(vm);
}

export function applyByMode (vm, mode, text) {
    const m = MODES[mode];
    if (!m) throw new Error('未知模式：' + mode);
    return m.apply(vm, text);
}
