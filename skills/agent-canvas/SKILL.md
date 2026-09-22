---
name: agent-canvas
description: Use AgentCanvas MCP to organize persistent project cards, Sections, diagrams and tasks, or process canvas annotations. Apply when the user asks to work in AgentCanvas; preserve object identity and layout while editing. Includes flowchart, swimlane and mind-map examples.
---

# AgentCanvas 共创画布

把工作留在同一组持久化对象上。优先使用 `agentcanvas` MCP；Pages 只是浏览器演示，不连接 MCP。用户当前画布、项目 ID 和讨论请求 ID 优先于示例参数。

## 开始工作

1. 确认当前客户端实际发现的工具；需要指南时调用 `read_usage_guide`。工具缺失不等于服务没有实现：报告缺失项，检查适配器版本或重新加载连接，不宣称已成功写入。
2. 用 `list_projects` / `read_canvas` 确定目标项目和画布；分页读完相关对象，子画布按需展开。用户未指明且有多个候选时先澄清，不创建替代项目。
3. 修改前 `read_objects` 读取最新版本。内容对象 ID、展示位置 placement ID、Section ID、canvas ID 含义不同，不能互换。工具返回创建结果后核对实际 ID。
4. 每次逻辑写入使用唯一 `requestId`；结果不明时复用相同 ID 和参数重试，改了参数就换 ID。写入冲突时重新读取并比较差异，不直接覆盖用户内容。
5. 修改后重新读取目标或 `read_changes`，交付对象定位链接及简短说明。画布里的“完成”状态不是外部执行成功证据。

## 内容与布局规范

- 一个卡片承载一个可讨论的主题；标题简洁，正文存真实换行的 Markdown，不把整篇正文包进代码块。支持 GFM 表格、任务列表、链接和 Mermaid；Markdown 复选框仅展示，交互任务使用 `tasks` 卡片。
- 修改原对象，保留 ID、批注、来源引用和已有布局。只有用户要求新建或重新整理的范围才安排位置；先读本层，避免覆盖现有内容。
- 内容通过 `update_content` 修改；普通位置通过 `set_layout` 或事务修改 placement。关系引用同层 placement ID；箭头、包含、普通关联用不同 `lineStyle`，标签可以为空。
- **当前原生连线只有左侧 `in`、右侧 `out` 两个端点。** 没有上下端点、端点选择参数或自动避障。新流程优先从左向右排；遇到密集回路可改用 Mermaid 或拆子画布。不要为了绕过端点限制擅自重排用户的既有图。
- 思维导图父子关系禁止环，流程图可有回路。包含关系线是语义关系，不自动产生子画布或 Section 成员关系。
- Section 是同层卡片展示的分组，不是子画布或原生泳道。`create_section` 使用至少两个 placement ID；每个 placement 只能属于一个 Section，暂不嵌套。
- 移动 Section 使用 `move_section`，保持内部相对位置；不要只改 Section 的 x/y 或逐个散移成员。改名用 `update_content`；解除用 `apply_changes` 删除 Section 对象，**不删除成员**。网页中需要单独调整成员位置或尺寸时先解除分组。
- 图片是卡片内容，上传后引用资产 ID。文件链接可放 Markdown 正文或 `fileReferenceIds`；本地相对路径从服务工作区解析。原文件引用不会复制，托管图片上传会复制；勿把本机路径写进公开范例。
- 浏览器只读只限制网页内容编辑，批注仍可写，MCP 仍受其原有授权约束。归档与删除、解决批注是不同状态；需要历史资料时分页读取归档，默认不要把归档内容搬回画布。

## 批注处理

先读 `read_requests`，再读目标当前版本；按需读取子画布或图片。

- 整卡 / 多卡片：综合请求中的 targets，更新原对象。
- 文字选区：`textContext` 保存历史原文、字段和版本；核对 quote 及前后文。start/end 是渲染文本偏移，不能当 Markdown 源码偏移。
- 元素调试：`debugContext` 用于查代码和界面；DOM 选择器需重新核对，不把界面缺陷改写成卡片正文。
- 媒体：核对 `mediaContext` 的文件、视频时间点和截图；历史截图不代表文件现在的状态。

完成后 `reply_request` 说明具体修改和验证。遇到阻塞如实回复，不把 `processing` 当成 Agent 实时在线，也不因复制交接文本就声称已送达。

## 按需参考

- 工具、ID、状态及能力边界：[references/mcp-reference.md](references/mcp-reference.md)。完整工具覆盖清单见 [references/capabilities.json](references/capabilities.json)。
- 创建泳道图、流程图、思维导图时读 [references/diagram-patterns.md](references/diagram-patterns.md)。其中的 JSON 调用范例经真实协议测试，在用户授权的新区域或新画布中适配使用，不直接写入范例占位符。
