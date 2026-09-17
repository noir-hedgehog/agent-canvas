# AgentCanvas

人与 Agent 共创的持久化画布：把思路、任务、文件和讨论留在同一组对象上。

[在线体验](https://noir-hedgehog.github.io/agent-canvas/) · [下载本地版](https://github.com/noir-hedgehog/agent-canvas/releases) · [发行说明](docs/acceptance.md)

![公开示例素材](public/demo-assets/board.png)

## 可以做什么

- 自适应卡片、便签、Markdown/GFM 表格和任务列表、Mermaid 图表。
- 可编辑连线、方向与关系标签；思维导图、流程图及多层子画布。
- Todo / Kanban 共用任务；跨画布引用共享内容、独立布局。
- 图片、视频、Markdown 文件引用和弹窗预览；图片截图批注、视频时间点及截图批注。
- 对象批注和界面元素调试批注，编辑、状态切换、批量复制、归档与恢复。
- 缩略图、卡片目录、网格对齐、字体偏好、缩放锁定。
- 本地 SQLite 保存、版本冲突检测、事务与重试去重、撤销、SSE 同步。
- 真实 STDIO MCP：项目范围的只读 / 编辑口令，读取上下文、修改原对象、回复讨论。

## 选择版本

| | GitHub Pages 演示 | 本地发行包 |
| --- | --- | --- |
| 启动 | 打开网页 | Node.js 24+，首次启动联网安装依赖 |
| 数据 | 当前浏览器的 localStorage | 本机 SQLite 和资产目录 |
| 文件 | 内置示例、HTTP(S) 直链、少量图片上传 | 工作区文件引用、托管图片 |
| Agent | 不运行 MCP、不生成口令 | STDIO MCP + 项目授权 |
| 用途 | 体验交互、查看功能与规划 | 单机持续共创 |

演示数据全部为人工编写的公开示例。清除浏览器数据或重置演示会丢失浏览器内修改；它不适合保存正式项目。应用不主动上传演示内容，页面由 GitHub Pages 托管；远程媒体链接会向目标地址发起请求。Docker 暂缓，见[评估记录](docs/public/docker-evaluation.md)。

## 本地发行包

从 Releases 下载 `agentcanvas-0.1.0-local.tar.gz`（macOS / Linux）或 `.zip`（Windows），解压到可写目录。包内已包含构建好的前端，不需要开发工具链；**仍需安装 Node.js 24 或更高版本，并在首次启动时联网下载依赖**。

macOS / Linux：

```sh
cd agentcanvas-0.1.0-local
./start.sh
```

Windows：双击 `start.cmd`，或在解压目录的终端运行它。

出现启动提示后打开 **http://127.0.0.1:4317**。按 Ctrl+C 停止；再次运行同一启动文件即可继续。登录自启动默认关闭。端口被占用会报错，不会停止其他应用。自定义端口可设置 `AGENTCANVAS_PORT`；MCP 接入指令会使用实际端口。

首次启动建立「功能导览与路线图」示例；已存在项目不会被覆盖。项目选择菜单可以创建空白项目。当前包为早期单机版本，不提供公网服务或多人协作。

### 连接 Agent

先启动本地应用，点击「连接 Agent」，选择只读或编辑权限，生成并复制接入指令。把指令交给同机 Agent，按其中的 STDIO 配置接入 MCP；客户端可能需要重新加载或重启才能发现工具。复制并不代表已连接。

批注保存后，复制给 Agent；Agent 应先读最新对象版本，保留布局，修改原对象并回复。MCP 支持 Markdown 和 Mermaid 源码、归档状态、子画布按需读取。不要公开接入指令中的口令。撤销项目口令可终止后续授权访问；同机管理员凭据具有工作区权限。

### 数据、备份与升级

数据默认在解压目录的 `.agentcanvas/`，包含数据库、图片、截图和本地凭据。文件引用指向原文件，不自动复制；移动原文件后需重新关联。

- 备份：停止应用，把整个 `.agentcanvas/` 复制到安全位置，同时备份引用的原文件。也可运行 `npm run backup -- /绝对路径/备份目录` 创建数据库一致性备份。
- 恢复：停止应用，将备份内容还原到 `.agentcanvas/`，再启动。备份包含凭据，应保持私密。
- 升级：先备份，解压新版到新目录，再复制 `.agentcanvas/`；引用文件的相对路径也需保持一致。不要覆盖或删除唯一的数据副本。

## 从源码运行

```sh
npm ci
npm test
npm run build
npm start
```

开发时运行 `npm run server` 和 `npm run dev`；前端端口 4318。`npm run build:demo` 构建纯静态演示到 `dist-demo/`。`npm run package:local` 从已构建的 `dist/` 生成本地发行包。

`CanvasEditor` 可独立嵌入，接受项目、画布和对象定位参数并输出选择与讨论事件；`/embed` 提供最小宿主演示。真实宿主会话、云端和多人协作尚未实现。

## 接下来的规划

全文检索与文件重连、导入导出与版本比较、大画布性能、键盘及无障碍体验、宿主会话接入与细化授权。顺序依据反馈调整；这些项目不代表已交付能力。
