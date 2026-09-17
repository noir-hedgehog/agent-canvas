import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.AGENTCANVAS_URL || "http://127.0.0.1:4317";
if (new URL(base).hostname !== "127.0.0.1")
  throw new Error("只允许停止本机 AgentCanvas");
const token = readFileSync(
  path.join(
    process.env.AGENTCANVAS_DATA_DIR || path.join(root, ".agentcanvas"),
    "token",
  ),
  "utf8",
).trim();
try {
  const r = await fetch(base + "/api/runtime", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error("未能验证本地服务身份");
  const runtime = await r.json();
  if (runtime.workspace !== root || !Number.isInteger(runtime.pid))
    throw new Error("端口上的进程不属于此工作区，未停止");
  process.kill(runtime.pid, "SIGTERM");
  console.log("AgentCanvas 已发送停止请求");
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
}
