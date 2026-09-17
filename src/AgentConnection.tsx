import {DEMO_MODE} from "./runtime";
import { useEffect, useState } from "react";
import { Copy, KeyRound, X } from "lucide-react";
import type { Project } from "../shared/model";
import { api } from "./state";
type Grant = { id: string; name: string; permission: "read" | "edit"; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };

export function AgentConnection({ project, onClose }: { project: Project; onClose: () => void }) {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [name, setName] = useState("我的 Agent");
  const [permission, setPermission] = useState<"read" | "edit">("edit");
  const [handoff, setHandoff] = useState("");
  const [issuedId, setIssuedId] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/projects/${project.id}/connections`;
  useEffect(() => {
    if(DEMO_MODE)return;
    let active = true;
    const refresh = async () => {
      try { const list = await api<Grant[]>(endpoint); if (active) { setGrants(list); setError(""); } }
      catch (e) { if (active) setError((e as Error).message); }
    };
    void refresh();
    const timer = setInterval(refresh, 5000);
  return () => { active = false; clearInterval(timer); };
  }, [endpoint]);
  async function generate() {
    setBusy(true); setError(""); setCopied(false);
    try {
      // Load setup before issuing a secret, so a setup failure cannot lose it.
      const runtime = await api("/api/runtime");
      const result = await api<{ grant: Grant; accessCode: string }>(endpoint, { name, permission });
      const config = { mcpServers: { agentcanvas: { ...runtime.mcp,
        env: { ...runtime.mcp.env, AGENTCANVAS_ACCESS_CODE: result.accessCode } } } };
      setIssuedId(result.grant.id);
      setGrants(previous => [result.grant, ...previous]);
      setHandoff(`请连接本机 AgentCanvas 项目「${project.name}」。\n项目 ID：${project.id}\n授权：${permission === "edit" ? "读取和编辑本项目" : "只读本项目"}\n\n请先调用 agentcanvas.connect_project，accessCode 为：${result.accessCode}\n连接成功后读取最新画布和讨论请求；修改前先读取对象版本，保留用户布局，完成后回复对应批注。请勿在回复或日志中复述口令。\n\n如果尚未配置 agentcanvas MCP，或工具列表没有 connect_project，请使用下方本机 STDIO 配置接入并重新加载工具；不同客户端请将 command、args、env 填入对应 MCP 设置。配置中的口令会在适配器重启后继续限制项目权限。已有适配器仅用 connect_project 连接时，重启后需重新输入口令。\n${JSON.stringify(config, null, 2)}\n\n这是本机连接，需要 Agent 与 AgentCanvas 在同一台电脑运行。`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function revoke(grant: Grant) {
    setBusy(true);
    try {
      const updated = await api<Grant>(`${endpoint}/${grant.id}/revoke`, {});
      setGrants(previous => previous.map(g => g.id === updated.id ? updated : g));
      if (issuedId === grant.id) { setHandoff(""); setIssuedId(""); }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  if(DEMO_MODE)return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal agent-connection" role="dialog" aria-modal="true" aria-label="连接 Agent" onKeyDown={e=>{if(e.key==="Escape")onClose();}}><h2>连接 Agent · 本地版能力</h2><p>GitHub Pages 不运行 MCP 服务，不生成连接口令。下载本地版后，可以让 Agent 读取批注、修改原对象并回复。</p><a href="https://github.com/noir-hedgehog/agent-canvas/releases">查看发行版本</a><button onClick={onClose}>返回画布</button></div></div>;
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="modal agent-connection" role="dialog" aria-modal="true" aria-label="连接 Agent" onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape") onClose(); }}>
      <div className="modal-heading"><h2><KeyRound size={19} /> 连接 Agent</h2><button aria-label="关闭连接面板" onClick={onClose}><X size={18} /></button></div>
      <p>让 Agent 与你共同编辑「{project.name}」。生成口令后，把接入指令复制到 Agent 会话。</p>
      <div className="project-storage"><strong>项目已持久化到本机</strong><span>内容自动保存，刷新或重启后保留。未提交的输入草稿保存在当前浏览器。</span></div>
      <form onSubmit={e => { e.preventDefault(); void generate(); }}>
        <div className="connection-fields">
          <label>连接名称<input autoFocus required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="例如：设计助手" /></label>
          <label>访问权限<select value={permission} onChange={e => setPermission(e.target.value as "read" | "edit")}><option value="edit">读取和编辑</option><option value="read">只读</option></select></label>
        </div>
        <button className="primary" disabled={busy || !name.trim()}>{busy ? "处理中…" : "生成连接口令"}</button>
      </form>
      {handoff && <div className="connection-handoff"><div><strong>接入指令已准备好</strong><button className="primary" onClick={async () => {
        try { await navigator.clipboard.writeText(handoff); setCopied(true); }
        catch { setError("复制失败，请选择下方文本手动复制。"); }
      }}><Copy size={14} />{copied ? "已复制接入指令" : "复制给 Agent"}</button></div>
        <textarea aria-label="Agent 接入指令" readOnly value={handoff} />
        <small>口令仅在此展示，关闭后无法找回；可重新生成。复制不代表 Agent 已连接。</small>
      </div>}
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="connection-list"><h3>项目连接</h3>{!grants.length && <p>尚未生成口令。只有拿到口令的 Agent 才能使用该授权。</p>}
        {grants.map(g => <div className={`connection-row ${g.revokedAt ? "revoked" : ""}`} key={g.id}>
          <div><strong>{g.name}</strong><span>{g.permission === "edit" ? "读取和编辑" : "只读"} · {g.revokedAt ? "已撤销" : g.lastUsedAt ? `最近访问 ${new Date(g.lastUsedAt).toLocaleString()}` : "等待首次访问"}</span></div>
          {!g.revokedAt && <button className="danger-text" disabled={busy} onClick={() => void revoke(g)}>撤销口令</button>}
        </div>)}
      </div>
      <p className="connection-footnote">口令仅授权当前项目，可随时撤销。最近访问不代表 Agent 正在运行。本轮为本机轻量授权，不限制同机文件访问或原有工作区管理员连接。</p>
    </section>
  </div>;
}
