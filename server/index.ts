import path from "node:path";
import {existsSync,cpSync} from "node:fs";
import { fileURLToPath } from "node:url";
import { createApplication } from "./app.ts";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const samples = path.join(root,"public/demo-assets");
if(existsSync(samples))cpSync(samples,path.join(root,"demo-assets"),{recursive:true,force:false});
const port = Number(process.env.AGENTCANVAS_PORT || 4317);
const service = createApplication({
  workspace: root,
  dataDir: process.env.AGENTCANVAS_DATA_DIR || path.join(root, ".agentcanvas"),
  port,
  distDir: path.join(root, "dist"),
});
const server = service.app.listen(port, "127.0.0.1", () =>
  console.log(`AgentCanvas http://127.0.0.1:${port}`),
);
server.on("error", (e: NodeJS.ErrnoException) => {
  console.error(
    e.code === "EADDRINUSE"
      ? `端口 ${port} 已被占用；未修改其他服务。`
      : e.message,
  );
  service.close();
  process.exit(1);
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    service.close();
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
