# FrostEditor 多人协作 - Cloudflare Workers 部署指南（Web 界面版）

不需要命令行，直接在 Cloudflare 网页上操作即可。

---

## 第一步：创建 Worker

1. 登录你的 Cloudflare 账号：https://dash.cloudflare.com/
2. 在左侧菜单中找到 **Workers & Pages**，点击进入
3. 点击右上角的 **Create application**（创建应用）
4. 选择 **Create Worker**（创建 Worker）
5. 给你的 Worker 起个名字，比如 `frosteditor-collaboration`
6. 点击 **Deploy**（部署）

---

## 第二步：替换代码

1. 部署完成后，点击 **Edit code**（编辑代码）按钮
2. 你会看到在线代码编辑器
3. 删除编辑器中所有默认的代码
4. 打开 `worker-single-file.js` 文件，复制里面的**全部代码**
5. 粘贴到 Cloudflare 的在线编辑器中
6. 点击右上角的 **Save and deploy**（保存并部署）

---

## 第三步：创建 Durable Object 命名空间

Durable Objects 是用来持久化房间状态的，需要单独创建。

1. 回到 Workers & Pages 主页面
2. 在左侧菜单中找到 **Durable Objects**（在 Workers 下面）
3. 点击 **Create namespace**（创建命名空间）
4. 填写：
   - **Name**（名称）：`ROOM`（必须是这个名字，代码中用的是这个）
   - **Class name**（类名）：`RoomObject`（必须是这个名字，代码中导出的类名）
   - **Script**（脚本）：选择你刚才创建的 Worker（比如 `frosteditor-collaboration`）
5. 点击 **Add**（添加）

---

## 第四步：绑定 Durable Object 到 Worker

1. 回到你的 Worker 详情页面
2. 点击 **Settings**（设置）标签页
3. 在左侧菜单中选择 **Variables**（变量）
4. 往下滚动，找到 **Durable Object bindings**（Durable Object 绑定）部分
5. 点击 **Add binding**（添加绑定）
6. 填写：
   - **Variable name**（变量名）：`ROOM`（必须是这个名字）
   - **Durable Object**（Durable Object）：选择你刚才创建的 `ROOM` 命名空间
   - **Environment**（环境）：保持默认（production）
7. 点击 **Save**（保存）

---

## 第五步：获取你的 Worker 地址

1. 回到 Worker 的 **Overview**（概览）页面
2. 你会看到一个类似这样的地址：
   ```
   https://frosteditor-collaboration.your-username.workers.dev
   ```
3. 复制这个地址，这就是你的协作服务器地址

---

## 第六步：在 FrostEditor 中使用

1. 打开 FrostEditor
2. 点击顶部菜单栏的**多人协作**图标
3. 在**服务器地址**中粘贴你刚才复制的 Worker 地址
4. 点击**创建房间**或**加入房间**

---

## 常见问题

### Q: 为什么需要 Durable Objects？
A: Durable Objects 是 Cloudflare 提供的有状态服务，每个房间对应一个 Durable Object 实例，可以持久化保存房间状态（项目数据、成员列表等），即使服务器重启也不会丢失。

### Q: 部署后测试连接失败怎么办？
A: 
1. 检查 Worker 地址是否正确
2. 检查 Durable Object 绑定是否正确（变量名必须是 `ROOM`）
3. 检查 Durable Object 的类名是否是 `RoomObject`
4. 打开浏览器开发者工具，查看 Console 和 Network 标签页的错误信息

### Q: 可以自定义房间密钥长度吗？
A: 可以，在代码中找到 `generateRoomKey()` 函数，修改 `const array = new Uint8Array(6);` 中的数字即可。

### Q: 数据会保存多久？
A: Durable Object 的存储是持久化的，只要你不删除命名空间，数据就会一直保存。但房间空了之后，Durable Object 实例可能会被销毁，下次有人加入时会重新创建并从存储中恢复数据。

---

## 技术说明

- **服务器类型**：Cloudflare Workers + Durable Objects
- **协议**：WebSocket
- **房间密钥**：6 位大写字母+数字
- **支持功能**：
  - 创建/加入房间
  - 实时同步项目
  - 成员管理（踢出、房主转移）
  - 鼠标位置同步
  - 完整项目同步（包含图片、声音等资源）
  - 聊天消息（预留接口）
