#!/usr/bin/env node
'use strict';

/**
 * FrostEditor 供应链安全扫描器
 * ----------------------------------------------------------------------------
 * 在项目构建 / 安装前扫描 node_modules，拦截已知的恶意代码签名与高危模式，
 * 并校验所有 github: 依赖实际安装的 commit 是否等于 package.json 中钉死的 commit。
 *
 * 退出码：
 *   0  -> 未发现高危项（仅有低置信度告警时也会通过）
 *   1  -> 发现恶意签名或依赖完整性校验失败（构建应被阻断）
 *   2  -> 扫描器自身无法运行（如 node_modules 不存在）
 *
 * 用法：
 *   node scripts/security-scan.js
 * 也可被 npm 脚本 / CI 调用。
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'node_modules');

// 仅扫描这些文本扩展名，兼顾覆盖率与性能（投毒代码均为 JS 注入）
const SCAN_EXT = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.html']);
const SKIP_DIRS = new Set(['.bin', '.cache', '.git', '.svn', 'node_modules/.package-lock.json']);
const MAX_FILE_BYTES = 4 * 1024 * 1024; // 超过 4MB 的文件跳过（如 wasm / 超大 sourcemap）

// ---------------------------------------------------------------------------
// 1) 已知恶意签名（高置信度，命中即判定为恶意，阻断构建）
//    第一项来自 2026-07 scratch-paint 供应链投毒事件，其余为同类攻击的通用指纹。
// ---------------------------------------------------------------------------
const MALICIOUS_SIGNATURES = [
  {
    name: 'scratch-paint 全屏不可关闭弹窗（2026-07 投毒事件）',
    patterns: [
      'fe-nuclear-overlay',
      '已黑入FE',
      '中大奖啦',
      'nukePage',
      'Cannot be closed',
      'Please restart the application',
    ],
  },
  {
    name: 'DOM 清空 / 宿主页面自毁',
    patterns: [
      /document\s*\.\s*(body|documentElement)\s*\.\s*innerHTML\s*=\s*['"]\s*['"]/,
      /documentElement\.replaceChildren\s*\(\s*\)/,
    ],
  },
  {
    name: 'MutationObserver 复活被移除的恶意 DOM（反清除）',
    patterns: [
      /new\s+MutationObserver[\s\S]{0,500}?\.observe\(\s*document\b[\s\S]{0,200}?\.body/,
      /MutationObserver[\s\S]{0,600}?removedNodes[\s\S]{0,300}?appendChild/,
    ],
  },
  {
    name: '全屏不可关闭遮罩（z-index 极高 + fixed）',
    patterns: [
      /position\s*:\s*fixed[^}]*z-index\s*:\s*99999/i,
    ],
  },
  {
    name: '远程脚本动态植入（eval/Function 执行网络内容）',
    patterns: [
      /eval\s*\(\s*(await\s+)?(fetch|atob|Buffer\s*\.\s*from)/,
      /new\s+Function\s*\(\s*(await\s+)?fetch/,
    ],
  },
];

// 低置信度启发式（仅告警，不阻断）
const HEURISTIC_PATTERNS = [
  /while\s*\(\s*true\s*\)\s*\{[\s\S]{0,50}?\}/,
  /document\.write\s*\(\s*(location|window\.location)/,
];

const maliciousHits = [];
const heuristicHits = [];

function isScannable(file) {
  const ext = path.extname(file).toLowerCase();
  if (!SCAN_EXT.has(ext)) return false;
  try {
    if (fs.statSync(file).size > MAX_FILE_BYTES) return false;
  } catch {
    return false;
  }
  return true;
}

function scanFile(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return;
  }
  if (buf.includes(0)) return; // 二进制，跳过
  const text = buf.toString('utf8');

  for (const sig of MALICIOUS_SIGNATURES) {
    for (const p of sig.patterns) {
      const matched = p instanceof RegExp ? p.test(text) : text.includes(p);
      if (matched) {
        maliciousHits.push({
          file: path.relative(ROOT, file),
          signature: sig.name,
          pattern: p instanceof RegExp ? p.toString() : p,
        });
      }
    }
  }
  for (const p of HEURISTIC_PATTERNS) {
    if (p.test(text)) {
      heuristicHits.push({ file: path.relative(ROOT, file), pattern: p.toString() });
    }
  }
}

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name));
    } else if (e.isFile()) {
      const full = path.join(dir, e.name);
      if (isScannable(full)) scanFile(full);
    }
  }
}

// ---------------------------------------------------------------------------
// 2) 依赖完整性校验：所有 github: 依赖实际安装 commit 必须等于 package.json 钉死值
// ---------------------------------------------------------------------------
function parsePinnedGitDeps() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies);
  const pinned = [];
  for (const [name, spec] of Object.entries(deps)) {
    const m = /^github:([^/]+\/[^-#]+)#([a-f0-9]{7,40})$/.exec(spec);
    if (m) pinned.push({ name, repo: m[1], commit: m[2] });
  }
  return pinned;
}

function verifyGitDepIntegrity(pinned) {
  for (const { name, commit } of pinned) {
    const pkgPath = path.join(TARGET, name, 'package.json');
    let installed;
    try {
      installed = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch {
      // 找不到已安装包，交给 npm ci 报错，这里不重复拦截
      continue;
    }
    const resolved = installed._resolved || '';
    const sha = resolved.split('#')[1] || '';
    if (!sha) {
      heuristicHits.push({
        file: path.relative(ROOT, pkgPath),
        pattern: 'github dep missing _resolved commit (cannot verify integrity)',
      });
      continue;
    }
    if (!sha.startsWith(commit)) {
      maliciousHits.push({
        file: path.relative(ROOT, pkgPath),
        signature: `github 依赖完整性失败：${name} 实际 ${sha.slice(0, 12)} ≠ 钉死 ${commit.slice(0, 12)}`,
        pattern: resolved,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
function main() {
  console.log('[security-scan] 开始扫描 node_modules 中的恶意代码签名...');

  if (!fs.existsSync(TARGET)) {
    console.error('[security-scan] 错误：未找到 node_modules，请先安装依赖。');
    process.exit(2);
  }

  walk(TARGET);
  console.log(`[security-scan] 已扫描文件，发现 ${maliciousHits.length} 个高危命中、${heuristicHits.length} 个低置信度告警。`);

  console.log('[security-scan] 校验 github: 依赖完整性...');
  const pinned = parsePinnedGitDeps();
  console.log(`[security-scan] 已钉死 ${pinned.length} 个 github 依赖：${pinned.map((p) => p.name).join(', ')}`);
  verifyGitDepIntegrity(pinned);

  let blocked = false;

  if (maliciousHits.length > 0) {
    blocked = true;
    console.error('\n❌ 发现恶意代码签名，已阻断构建：');
    for (const h of maliciousHits) {
      console.error(`   - [${h.signature}]`);
      console.error(`     @ ${h.file}`);
      console.error(`     匹配: ${h.pattern}`);
    }
  }

  if (heuristicHits.length > 0) {
    console.warn('\n⚠️  低置信度告警（未阻断，请人工复核）：');
    for (const h of heuristicHits.slice(0, 20)) {
      console.warn(`   - ${h.file}  (${h.pattern})`);
    }
    if (heuristicHits.length > 20) console.warn(`   ... 其余 ${heuristicHits.length - 20} 条省略`);
  }

  if (blocked) {
    console.error(
      '\n[security-scan] 安全扫描未通过。若确认是误报，请人工复核后临时跳过（不推荐）。'
    );
    process.exit(1);
  }

  console.log('\n✅ 安全扫描通过：未检测到已知恶意代码，github 依赖完整性校验一致。');
  process.exit(0);
}

main();
