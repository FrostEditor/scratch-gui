# FrostEditor PeerJS 信令服务器部署指南

## 一、本地测试

### 1. 安装依赖
```bash
cd E:\Editor\scratch-gui
npm install peer express --save-dev
```

### 2. 启动服务器
```bash
node peer-server.js
```

服务器会运行在 `http://localhost:9000`

### 3. 测试
访问 `http://localhost:9000/health`，应该返回：
```json
{"status":"ok","service":"froste-peer-server","time":"..."}
```

---

## 二、服务器部署（VPS 方案）

### 1. 上传文件
把 `peer-server.js` 上传到你的服务器

### 2. 安装依赖
```bash
npm init -y
npm install peer express --save
```

### 3. 安装 PM2（进程守护）
```bash
npm install -g pm2
```

### 4. 启动服务
```bash
pm2 start peer-server.js --name "froste-peer"
pm2 save
pm2 startup
```

### 5. 配置 Nginx 反向代理（可选，推荐）
```nginx
server {
    listen 80;
    server_name peer.froste.top;

    location / {
        proxy_pass http://localhost:9000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 6. 配置 HTTPS
用 Let's Encrypt 或者 Cloudflare 都可以。

---

## 三、Cloudflare 配置

### 1. 添加 DNS 记录
- 类型：A
- 名称：peer（或者你想要的子域名）
- 内容：你的服务器 IP
- 代理状态：已代理（橙色云朵）

### 2. SSL/TLS 模式
设置为「灵活」或「完全」，根据你的服务器是否有 HTTPS 证书。

---

## 四、修改前端配置

部署好服务器后，修改 `src/lib/collaboration/collaboration-manager.js` 中的 PeerJS 配置：

找到 `new Peer(...)` 的地方，改成：

```javascript
this.peer = new Peer(roomKey, {
    host: 'peer.froste.top',  // 你的域名
    port: 443,
    path: '/',
    key: 'froste',
    debug: 2,
    secure: true,  // HTTPS 设为 true
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ]
    }
});
```

有两个地方需要改：
1. `createRoom()` 方法中的 Peer 配置
2. `joinRoom()` 方法中的 Peer 配置

---

## 五、环境变量配置（可选）

你可以通过环境变量配置服务器：

```bash
PORT=9000
PATH=/
KEY=froste
```

---

## 六、常用命令

```bash
# 查看日志
pm2 logs froste-peer

# 重启
pm2 restart froste-peer

# 停止
pm2 stop froste-peer

# 查看状态
pm2 status
```
