import {createOp,placementOp,type Operation,type Snapshot} from './model';
import {diagramOperations} from './diagram';

export const showcaseTitle='AgentCanvas · 功能导览与路线图';
export function showcaseOperations(root:string,prefix='showcase'):Operation[] {
 const id=(key:string)=>`${prefix}-${key}`,ops:Operation[]=[];
 const card=(key:string,title:string,body:string,x:number,y:number,color='white',kind:'card'|'note'|'text'='card',width=330)=>{
  ops.push(createOp(kind,root,{title,body,background:color,...(kind==='note'?{color}:{})},id(key)),placementOp(root,id(key),x,y,width,180,undefined,id(`${key}-place`)));
 };
 card('welcome','一起，把想法展开。','## Agent × 人，共同工作的画布\n\n这是可自由探索的**公开示例**。\n\n先看功能地图，再进入子画布；试着修改文字、拖动卡片、留下批注。\n\n**01 组织内容 → 02 展开细节 → 03 批注 → 04 共同推进**',30,30,'purple','card',430);
 card('basics','01 / 卡片是工作的基本单元','空白卡片可转换为便签、文本、画布或图卡片。\n\n- Markdown / 表格 / 任务列表\n- 图片及文件内联链接\n- 内容自适应高度、颜色和尺寸\n- 拖动、框选、撤销 / 重做\n- 自动布局：智能 / 树状 / 流程 / 网格，先预览再应用',510,30,'yellow');
 card('relations','02 / 用关系表达思路','连线支持箭头、包含和普通关联；可切换方向、编辑标签。\n\n右下角收纳箱支持拖入归档，恢复保留原位置及连线。\n\n拖动卡片时，将鼠标移到收纳箱上，再松手归档。',900,30,'blue');
 ops.push(...diagramOperations(root,'mind',id('map'),'03 / 功能地图 · 点此进入',30,430,430));
 const mapRoot=id('map')+':node-0',mapChild=id('map')+':canvas';
 for(const op of ops)if(op.op==='create'&&op.id.startsWith(id('map')+':node-')) {
  if(op.kind==='mind'){const n=Number(op.id.split('-').at(-1));op.data.title=['持久化共创','内容与关系','批注与 Agent'][n];op.data.body=['每个图节点都可以成为一个子画布。','卡片、文件、任务共享内容；布局独立。','讨论请求携带对象 ID 和版本。'][n];}
 }
 const deep=id('deep');ops.push(createOp('canvas',null,{title:'第三层 · 工作空间',ownerNodeId:mapRoot},deep));
 const rootOp=ops.find(o=>o.op==='create'&&o.id===mapRoot);if(rootOp?.op==='create')rootOp.data.childCanvasId=deep;
 ops.push(createOp('note',deep,{title:'你已经来到第三层',body:'使用上方「主画布」或面包屑返回。\n\n子画布支持相同的内容类型，按需展开。',color:'yellow'},id('deep-note')),placementOp(deep,id('deep-note'),100,100,360,160));
 ops.push(...diagramOperations(root,'flow',id('flow'),'04 / 流程图 · 点此进入',510,430));
 card('mermaid','05 / Markdown + Mermaid','文字与图表可以写在同一个描述里。\n\n```mermaid\nflowchart LR\n A[想法] --> B[实现] --> C[验证]\n```\n\n- [x] 源码保留，可继续编辑\n- [ ] 点击图表放大查看',900,430,'green');
 ops.push(createOp('tasks',root,{title:'06 / Todo ↔ Kanban',items:[{id:id('t1'),title:'整理功能地图',description:'切换视图，内容保持同步',status:'done'},{id:id('t2'),title:'体验批注与归档',description:'拖动任务到另一列',status:'doing'},{id:id('t3'),title:'选择下一步迭代',description:'路线图为后续计划，尚未实现',status:'todo'}]},id('tasks')),placementOp(root,id('tasks'),30,870,790,330,'board',id('tasks-place')),placementOp(mapChild,id('tasks'),780,80,350,260,'list',id('tasks-reference')));
 card('files','07 / 文件是上下文的一部分','[示例图片](demo-assets/board.png) · [示例视频](demo-assets/motion.mp4) · [Markdown 文件](demo-assets/guide.md)\n\n![纯示例画布](demo-assets/board.png)\n\n点击文件链接预览；图片可截图画框，视频批注包含时间点与截图。原文件不因引用被复制。',900,870,'pink');
 card('agent','08 / 从批注到 Agent','本地版提供真实 MCP：读取最新版本 → 修改原对象 → 回复批注。\n\n- 项目范围的只读 / 编辑口令\n- 事务、冲突检测和重试去重\n- 布局独立更新，SSE 同步\n\n**网页演示不连接 Agent**，批注仅供体验。',30,1300,'purple','card',430);
 card('roadmap','接下来的规划','## 待规划 / 尚未实现\n\n1. 全文检索、快速定位及文件重连体验\n2. 画布导出 / 导入与版本比较\n3. 大画布性能、键盘及无障碍体验\n4. 宿主会话接入与更细的授权管理\n5. 团队协作（评估阶段）\n\n顺序会根据使用反馈调整。',510,1300,'yellow');
 card('boundary','选择适合的版本','| 版本 | 存储 | Agent |\n| --- | --- | --- |\n| Pages 演示 | 当前浏览器 | 无 |\n| 本地版 | SQLite + 文件 | MCP |\n\nDocker 暂缓，待部署场景明确后评估。\n\n应用不主动上传演示内容；页面由 GitHub Pages 托管。生产能力以发布说明和验收记录为准。',900,1300,'blue');
 for(const [key,source,target,label,style] of [['r1','basics','relations','关联','association'],['r2','agent','roadmap','下一步','arrow']] as const)ops.push(createOp('relation',root,{sourcePlacementId:id(`${source}-place`),targetPlacementId:id(`${target}-place`),label,lineStyle:style,direction:style==='arrow'?'forward':'none'},id(key)));
 const targets=[{id:id('roadmap'),version:1,title:'接下来的规划',canvasId:root}];
 ops.push(createOp('annotation',root,{body:'先收集反馈，再确定下一轮优先级。',state:'open',targets},id('annotation')),createOp('request',root,{instruction:'先收集反馈，再确定下一轮优先级。',annotationId:id('annotation'),state:'pending',targets,replies:[]},id('request')));
 card('archive','已归档的探索','这是一张示例归档卡片。打开右下角收纳箱恢复它。',1300,30,'pink');
 const archived=ops.find(o=>o.id===id('archive'));if(archived?.op==='create')archived.data.archived=true;
 return ops;
}
export function showcaseSnapshot():Snapshot {
 const project={id:'showcase-project',rootCanvasId:'showcase-canvas',name:showcaseTitle,example:true,version:1};
 const operations=[createOp('canvas',null,{title:'主画布'},project.rootCanvasId),...showcaseOperations(project.rootCanvasId)];
 return {project,entities:operations.flatMap(o=>o.op==='create'?[{id:o.id,projectId:project.id,canvasId:o.canvasId,kind:o.kind,data:o.data,version:1,deleted:false}]:[]),changes:[]};
}
