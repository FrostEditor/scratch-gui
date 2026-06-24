# FrostEditor 多人协作功能

## 功能说明
基于 WebSocket 的实时多人协作功能，支持：
- 创建房间（生成 6 位随机房间密钥）
- 加入房间（通过房间密钥）
- 实时同步项目数据
- 房间成员管理（房主可以踢出成员）
- 房主自动转移（房主离开后自动转移给第一个成员）

## 快速开始

### 1. 安装服务器依赖
在项目根目录执行：
```bash
npm install ws uuid
```

### 2. 启动协作服务器
```bash
node collaboration-server.js
```

服务器默认运行在 `ws://localhost:8765`

### 3. 在编辑器中使用
1. 点击顶部菜单栏的「协作」按钮
2. 确认服务器地址（默认 `ws://localhost:8765`）
3. 点击「创建房间」或「加入房间」
4. 分享房间密钥给朋友，一起协作编辑

## 服务器配置

### 修改端口
设置环境变量 `PORT`：
```bash
PORT=9000 node collaboration-server.js
```

## 技术实现

### 前端
- `src/lib/collaboration/collaboration-manager.js` - 协作管理器（单例）
- `src/components/tw-collaboration-modal/` - 协作模态框组件
- `src/components/menu-bar/collaboration-icon.jsx` - 协作图标

### 后端
- `collaboration-server.js` - WebSocket 服务器
- 基于 `ws` 库实现
- 房间管理、成员管理、项目广播

### 同步机制
- 防抖：项目变化后 800ms 才发送，避免频繁更新
- 全量同步：每次发送完整的项目 JSON 数据
- 防循环：加载远程项目时不会触发本地更新发送

## 注意事项
1. 目前是全量同步，大项目可能会有延迟
2. 服务器是内存存储，重启后房间数据会丢失
3. 不支持冲突解决，后修改的会覆盖先修改的
4. 建议在局域网内使用，公网需要部署服务器

## 部署到公网
1. 将 `collaboration-server.js` 部署到你的服务器
2. 修改前端的服务器地址为你的服务器地址
3. 确保服务器端口开放（默认 8765）
4. 建议使用 Nginx 反向代理并配置 WSS（WebSocket Secure）
