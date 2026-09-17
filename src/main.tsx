import {DEMO_MODE} from "./runtime";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CanvasEditor } from "./CanvasEditor";
import "./app-shell.css";
const q = new URLSearchParams(location.search);
function EmbeddedDemo() {
  const [context, setContext] = useState(
    "选择画布中的内容，宿主会收到对象引用。",
  );
  return (
    <div className="embed-demo">
      <div className="embed-host">
        <strong>宿主应用示例</strong>
        <span>CanvasEditor 独立嵌入 · 共用本地数据</span>
        <output>{context}</output>
      </div>
      <CanvasEditor
        embedded
        projectId={q.get("project") || undefined}
        canvasId={q.get("canvas") || undefined}
        onSelectionChange={(c) =>
          setContext(`已选择 ${c.objectIds.length} 个对象 · ${c.canvasId}`)
        }
        onDiscussionRequest={(r) => setContext(`收到讨论请求 ${r.id}`)}
        onSendToConversation={(r) =>
          setContext(
            `会话交接演示已接收（未连接 Agent）：${r.data.instruction} · 请求 ${r.id}`,
          )
        }
      />
    </div>
  );
}
function PublicDemo() {
 return <div className="public-demo"><header className="demo-banner"><strong>AgentCanvas · 交互演示</strong><span>公开示例 · 修改仅存在当前浏览器 · 未连接 Agent</span><nav><button onClick={()=>{localStorage.removeItem('ac-demo-workspace-v1');for(const key of Object.keys(localStorage))if(key.startsWith('ac-demo-asset:')||key.startsWith('ac-view:showcase-project')||key.startsWith('ac-draft:showcase-project'))localStorage.removeItem(key);location.href=location.pathname;}}>重置示例</button><a href="https://github.com/noir-hedgehog/agent-canvas/releases">下载本地版</a><a href="https://github.com/noir-hedgehog/agent-canvas">GitHub ↗</a></nav></header><CanvasEditor projectId={q.get("project") || undefined} canvasId={q.get("canvas") || undefined} objectId={q.get("object") || undefined}/></div>;
}
createRoot(document.getElementById("root")!).render(
  DEMO_MODE ? <PublicDemo/> :
  location.pathname === "/embed" ? (
    <EmbeddedDemo />
  ) : (
    <CanvasEditor
      projectId={q.get("project") || undefined}
      canvasId={q.get("canvas") || undefined}
      objectId={q.get("object") || undefined}
    />
  ),
);
