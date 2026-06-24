# FrostEditor 多人协作 - Cloudflare Workers 部署指南

## 概述
使用 Cloudflare Workers + Durable Objects 部署多人协作服务器，与 Cloudflare Pages 完美配合。

## 前置要求
1. Cloudflare 账号
2. 已安装 Node.js
3. 已安装 Wrangler CLI（Cloudflare Workers 命令行工具）

## 安装 Wrangler

```bash
npm install -g wrangler
```

或者使用 npx（不用全局安装）：
```bash
npx wrangler --version
```

## 登录 Cloudflare

```bash
wrangler login
```

按照提示在浏览器中授权。

## 部署步骤

### 1. 进入 Worker 目录

```bash
cd collaboration-worker
```

### 2. 修改配置（可选）

编辑 `wrangler.toml`，修改项目名称：
```toml
name = "frosteditor-collaboration"  # 改成你想要的名字
```

### 3. 首次部署（需要创建 Durable Objects）

第一次部署需要添加 Durable Objects 迁移：

```bash
wrangler deploy
```

部署成功后，你会得到一个 Worker 地址，类似：
`https://frosteditor-collaboration.your-username.workers.dev`

### 4. 测试部署

访问健康检查端点：
```
https://your-worker.workers.dev/health
```

应该返回：`{"status":"ok"}`

## 前端配置

部署成功后，在 FrostEditor 编辑器中：

1. 点击顶部菜单栏的「协作」按钮
2. 在「服务器地址」中填入你的 Worker 地址：
   ```
   https://frosteditor-collaboration.your-username.workers.dev
   ```
3. 点击「创建房间」或「加入房间」

**注意**：地址是 `https://` 开头，不是 `wss://`，前端会自动转换。

## 绑定自定义域名（可选）

如果你想使用自己的域名：

1. 在 Cloudflare Dashboard 中进入你的 Workers
2. 找到「设置」→「触发器」→「自定义域」
3. 添加你的域名，比如 `collaboration.yourdomain.com`
4. 等待 DNS 生效

然后前端的服务器地址改成：
```
https://collaboration.yourdomain.com
```

## 本地开发测试

### 启动本地开发服务器

```bash
cd collaboration-worker
wrangler dev
```

开发服务器默认运行在 `http://localhost:8765`

### 测试

前端服务器地址填：
```
http://localhost:8765
```

## 架构说明

### Durable Objects
- 每个房间对应一个 Durable Object 实例
- 实例 ID 由房间密钥生成，确保同一个房间的用户连接到同一个实例
- 房间状态（成员列表、项目数据）持久化在 Durable Object Storage 中

### API 端点

#### `GET /api/create-room`
创建新房间，返回房间密钥。

响应：
```json
{
  "roomKey": "ABC123"
}
```

#### `WebSocket /room/{roomKey}`
连接到指定房间的 WebSocket。

查询参数：
- `memberId` - 成员 ID（可选，自动生成）
- `username` - 成员名称（可选，默认"匿名用户"）

#### `GET /health`
健康检查。

## WebSocket 消息协议

### 客户端 → 服务器

#### project-update
发送项目更新。
```json
{
  "type": "project-update",
  "projectData": { /* Scratch 项目 JSON */ }
}
```

#### kick-member
踢出成员（仅房主）。
```json
{
  "type": "kick-member",
  "memberId": "member_xxx",
  "reason": "原因"
}
```

#### chat
发送聊天消息。
```json
{
  "type": "chat",
  "message": "你好"
}
```

### 服务器 → 客户端

#### room-created / room-joined
房间创建/加入成功。
```json
{
  "type": "room-created",
  "roomKey": "ABC123",
  "isHost": true,
  "members": [...],
  "projectData": { /* 现有项目数据 */ }
}
```

#### member-joined
新成员加入。
```json
{
  "type": "member-joined",
  "member": {
    "id": "member_xxx",
    "username": "用户名",
    "isHost": false
  }
}
```

#### member-left
成员离开。
```json
{
  "type": "member-left",
  "memberId": "member_xxx"
}
```

#### host-changed
房主变更。
```json
{
  "type": "host-changed",
  "newHostId": "member_xxx"
}
```

#### project-update
项目更新。
```json
{
  "type": "project-update",
  "projectData": { /* 项目数据 */ },
  "senderId": "member_xxx",
  "senderName": "用户名"
}
```

#### kicked
被踢出。
```json
{
  "type": "kicked",
  "reason": "原因"
}
```

## 费用说明

Cloudflare Workers 免费额度：
- 每天 100,000 次请求
- Durable Objects 有单独的计费

对于小型项目，免费额度通常足够。
详细价格请参考：https://developers.cloudflare.com/workers/platform/pricing/

## 常见问题

### 1. 连接失败
- 检查 Worker 地址是否正确
- 确保地址是 `https://` 开头
- 检查 Worker 是否部署成功（访问 /health 端点）

### 2. 房间数据丢失
- Durable Object 实例可能会因为长时间不活动而被回收
- 但数据会保存在 Durable Object Storage 中，重新连接时会恢复
- 如果房间长时间没人，数据可能会被清理（取决于 Cloudflare 策略）

### 3. 同步延迟
- Workers 运行在 Cloudflare 边缘节点，延迟通常很低
- 如果延迟较高，检查是否跨地区连接

## 与 Node.js 版本的区别

| 特性 | Node.js 版本 | Workers 版本 |
|------|-------------|-------------|
| 部署方式 | 自己部署服务器 | Cloudflare 托管 |
| 扩展性 | 需手动扩容 | 自动扩缩容 |
| 延迟 | 取决于服务器位置 | 全球边缘节点 |
| 状态存储 | 内存 | Durable Object Storage |
| 费用 | 服务器费用 | 按请求计费（有免费额度） |
| 维护 | 自己维护 | Cloudflare 维护 |
