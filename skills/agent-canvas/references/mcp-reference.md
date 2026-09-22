# MCP 使用参考

以实际 `tools/list` 的输入 schema 为准。`read_usage_guide(topic="capabilities")` 返回与本 Skill 共源的工具清单，`topic="examples"` 返回可适配的示例调用。指南不包含用户画布数据或凭据。

## ID 与写入

| 对象 | 读取 / 操作 | 关键约束 |
| --- | --- | --- |
| 项目 | list_projects、connect_project、rename_project | 使用指定 projectId；口令不回显、不入日志或示例 |
| 画布 | read_canvas、create_child_canvas | rootCanvasId 是入口；子画布按需读取；分页响应查看 nextCursor |
| 卡片 | create_content、update_content、convert_card | 对象 ID 不随类型转换改变；expectedVersion 来自最新读取 |
| 图卡片 | create_diagram_card | 自动生成内部画布和起始图节点；先读内部现有节点再编辑，别叠加另一套模板 |
| 展示位置 | set_layout、apply_changes | placement.data.objectId 指向内容；任务跨层引用共享内容、各自布局 |
| 关系 | create_relation、update_content | sourcePlacementId/targetPlacementId 引用本层两张卡片；lineStyle 为 association/arrow/containment |
| 原生流程边 | apply_changes | edge.data.source/target 是 flow 对象 ID；同 graphId；允许回路 |
| Section | create_section、move_section | placementIds、title、x/y/width/height；至少两个卡片建组，不嵌套 |
| 批注 | read_requests、reply_request | targets 是历史快照；源对象必须另外读最新版本 |
| 历史 / 归档 | read_changes、undo_change、list_archived、set_archived | 撤销检测后续写入冲突；archive=active/archived/all；按 ID 可读归档对象 |
| 文件与图片 | reference_file、read_file_reference、import_image、read_image | reference_file 支持范围内路径/直链；read_image 返回实际图片，别只根据文件名判断 |

`apply_changes` 创建原生 edge 时显式传入 `{sourceSide:"auto",targetSide:"auto"}`，或固定如 `{sourceSide:"bottom",targetSide:"top"}`。省略两字段沿用旧版几何，便于导入旧数据。端点更新遵守 expectedVersion，可撤销；不改变 placement 坐标。

`create_content` 的 requestId 为 `run:step` 时，当前创建内容 ID 为 `run:step:content`，placement 为 `run:step:placement`。`create_section` 的 Section ID 为 `requestId:section`。工具返回值仍需核对，不能把示例 ID 当成用户现有对象。

`update_content` 提交 `{projectId,id,expectedVersion,patch,summary,requestId}`。修改正文只传 body 等相关字段。归档/处理状态优先用专门工具；高级 `apply_changes` 同一事务内每个 ID 只能出现一次（最多 300 个操作）。

Section 改名：对 Section ID 调用 `update_content`，patch 为 `{title:"需求评审"}`。解除：读最新 Section 后，`apply_changes` 提交 `{op:"delete",id:sectionId,expectedVersion}`。成员卡片、坐标、关系均保留；没有独立 `dissolve_section` 工具。

Section 移动工具会一起更新成员 placement 并校验版本。自动布局、网格对齐的网页操作也保留分组内部相对位置。

## 能力边界

- 四边端点通过 `sourceSide` / `targetSide` 设置，取值为 `auto|top|right|bottom|left`；不用内部 React Flow 的 sourceHandle/targetHandle 名称。`create_relation` 默认两端 auto；`update_content` 修改旧 relation/edge 的端点，mind 父子线修改子 mind 对象。只有一端指定时，另一端可为 auto；旧对象两字段均缺失时保持旧左右规则。箭头反转须同时交换对象 ID 和 sourceSide/targetSide。
- 网页有自动布局预览。当前 MCP 没有 `auto_layout` 工具；需要布局时，在授权范围内计算坐标，用版本化 placement 更新，Section 用 `move_section`。不要声称调用了自动布局算法。
- 泳道是 Section + 卡片的组合示例，没有 lane 专用实体、原生对齐泳道标题或泳道约束引擎。
- Mermaid 图在卡片正文中渲染，图内节点不是独立画布对象；需要分别批注、子画布或持续编辑时用原生图。
- 当前没有 MCP `create_project`，新项目从网页创建。Pages 演示不提供 MCP，不能拿其中的 ID 修改本地项目。

## 版本不同步排查

先列出当前客户端的工具，再检查本地适配器路径和运行版本。源码有工具但当前连接没有时，重新加载该 MCP 连接后再次发现；无法加载就报告具体缺项。Section 并非只能网页使用，当前协议提供 `create_section` 和 `move_section`。
