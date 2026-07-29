# FrostEditor 依赖安全与供应链加固

本文件记录 FrostEditor/scratch-gui 的第三方依赖安全策略、已知安全事件与应急流程。
**任何人在修改依赖、重新安装或部署前都应先读这一份。**

---

## 1. 为什么需要加固

2026-07 发生一起**供应链投毒事件**：项目依赖 `github:AstraEditor/scratch-paint#develop`
（浮动分支）。该仓库的 `src/index.js` 被植入一段恶意代码——进入模块时立即清空页面 DOM、
弹出**全屏、不可关闭**的伪装弹窗（含 `fe-nuclear-overlay` 遮罩、`MutationObserver` 反清除逻辑、
`已黑入FE` / `中大奖啦` 等字串），且 `npm ci` 会把它直接打进生产产物。

根因：**浮动分支（`#develop`/`#main`）依赖会被上游随时改写，无法复现、无法审计**。
一旦上游仓库被攻陷或投毒，所有引用它的项目会同步中招。

---

## 2. 当前钉死的可信依赖（必须保持 commit 锁定，禁止改回浮动分支）

以下依赖均来自 GitHub，已全部钉死到**经过人工确认干净的 commit**。新增或修改时，
**只能**使用完整 commit SHA，**绝不可**使用 `#develop` / `#main` / `#master` 等浮动引用。

| 包 | 仓库 | 钉死 commit | 状态 |
|----|------|-------------|------|
| scratch-audio | TurboWarp/scratch-audio | `aba00cd02e36d95407effafa03f3678e4c669b30` | ✅ 已确认 |
| scratch-blocks | TurboWarp/scratch-blocks | `4113c5348e6b4c76da9071a1800a62ab96ef793f` | ✅ 已确认 |
| scratch-paint | **AstraEditor/scratch-paint** | `a55405259d0d158c4851980e9e80463fd73e2c98` | ⚠️ 上游曾投毒，此 commit 为投毒前最后一个干净版本；**强烈建议迁移到 TurboWarp 官方 fork** |
| scratch-render | TurboWarp/scratch-render | `a67f7c9c07d459582c227d4fd3fae8f59d8fc9ce` | ✅ 已确认 |
| scratch-vm | TurboWarp/scratch-vm | `c4823421cb7c17d8d8a89878851ce1668c26a21f` | ✅ 已确认（含本地性能优化补丁，见第 5 节） |

> **重要**：`scratch-paint` 来自 `AstraEditor`（非 TurboWarp 官方），且历史上被投毒。
> 除非有强理由，否则应迁移到 `github:TurboWarp/scratch-paint#<commit>` 或 fork 自行维护，
> 不再信任 `AstraEditor/scratch-paint` 的任意分支。

---

## 3. 安全扫描器

`scripts/security-scan.js` 在**构建前**自动运行（通过 `prebuild` 钩子，Cloudflare Pages 的
`npm run build` 会触发；CI 中也有显式步骤）。它做两件事：

1. **恶意代码签名扫描**：遍历 `node_modules` 下所有 JS/JSON/HTML 文本文件，匹配已知恶意签名
   （如 `fe-nuclear-overlay`、`已黑入FE`、`nukePage`、DOM 清空、MutationObserver 反清除、
   全屏不可关遮罩、远程脚本动态植入等）。命中即非零退出，**阻断构建**。
2. **依赖完整性校验**：读取 `package.json` 中所有 `github:` 依赖，逐项比对
   `node_modules/<pkg>/package.json` 的 `_resolved` commit 是否等于钉死值。不一致即视为
   依赖被篡改，阻断构建。

低置信度启发式告警（如 `while(true)`、可疑 `document.write`）只打印、**不阻断**。

运行方式：
```bash
node scripts/security-scan.js      # 手动
npm run security:scan              # npm 脚本
npm run build                      # 会自动先跑扫描（prebuild）
```

---

## 4. 部署 / 安装安全约定

- `package-lock.json` **必须提交到仓库**，且需在 Linux 上可通过 `npm ci`
  （Cloudflare Pages 使用 `npm ci`）。本仓库的 lock 已补齐跨平台可选依赖（fsevents 等），
  Windows 本地生成的 lock 也能在 CI 通过。
- **禁止**执行「删 lock 后用 `npm install` 重新生成」这类操作，除非同步按第 3 节重新校验、
  并确认所有 github 依赖 commit 未变化。本次事件中正是「删 lock 重装」拉到了投毒 commit。
- 修改 `package.json` 依赖后，必须：
  1. 确认新依赖使用精确版本或 commit SHA；
  2. 重新生成 lock 并跑 `npm ci --dry-run` 验证一致性；
  3. 跑 `npm run security:scan` 确认无恶意签名；
  4. 提交新的 lock。

---

## 5. scratch-vm 本地优化补丁的持久化

VM 性能优化（5 处源码改动）直接落在 `node_modules/scratch-vm/src/` 中。注意：
**`npm install` / `npm ci` 会覆盖这些改动**。当前依赖已钉死到含这些优化的 commit
（`c4823421...`），且在每次安装后需将备份（`tmp/vm-optimized-backup/`）的 5 个文件复制回去。
长期建议改用 `patch-package` 或 fork scratch-vm 仓库持久化。

---

## 6. 应急流程（怀疑再次中招时）

1. **不要部署**。先本地 `npm run security:scan`，看命中详情。
2. 若命中：
   - 定位 `node_modules/<pkg>` 中具体文件，确认是否上游新投毒；
   - 将误改的依赖钉到上一个干净 commit（参考本表）；
   - 清理 `node_modules`，重新 `npm ci` + 扫描，通过后再部署。
3. 向平台举报投毒仓库（GitHub Report abuse / 国家网信办 / 公安部网络违法犯罪举报网站），
   不要以任何形式对第三方仓库实施未授权访问或篡改。

---

## 7. 合规声明

本加固仅涉及**自身仓库的依赖锁定与构建前扫描**，不包含对任何第三方系统的未授权访问、
入侵或篡改行为。如发现上游恶意仓库，请通过合法举报渠道处理。
