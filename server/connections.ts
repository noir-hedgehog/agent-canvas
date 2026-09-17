import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Store } from "./store.ts";
import { AppError } from "./store.ts";

export type Grant = {
  id: string; projectId: string; name: string; permission: "read" | "edit";
  createdAt: string; lastUsedAt: string | null; revokedAt: string | null;
};
const digest = (code: string) => createHash("sha256").update(code).digest("hex");
export class Connections {
  constructor(private store: Store) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS agent_connections(
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, json TEXT NOT NULL
    )`);
  }
  list(projectId: string): Grant[] {
    this.store.project(projectId);
    return this.store.db.prepare("SELECT json FROM agent_connections WHERE project_id=? ORDER BY rowid DESC")
      .all(projectId).map(r => JSON.parse(r.json as string));
  }
  create(projectId: string, name: string, permission: Grant["permission"]) {
    this.store.project(projectId);
    const accessCode = "acp_" + randomBytes(32).toString("base64url");
    const grant: Grant = { id: randomUUID(), projectId, name, permission,
      createdAt: new Date().toISOString(), lastUsedAt: null, revokedAt: null };
    this.store.db.prepare("INSERT INTO agent_connections VALUES(?,?,?,?)")
      .run(grant.id, projectId, digest(accessCode), JSON.stringify(grant));
    return { grant, accessCode };
  }
  authenticate(code: string): Grant | undefined {
    const row = this.store.db.prepare("SELECT json FROM agent_connections WHERE token_hash=?").get(digest(code));
    if (!row) return;
    const grant: Grant = JSON.parse(row.json as string);
    if (grant.revokedAt) return;
    grant.lastUsedAt = new Date().toISOString();
    this.store.db.prepare("UPDATE agent_connections SET json=? WHERE id=?").run(JSON.stringify(grant), grant.id);
    return grant;
  }
  revoke(projectId: string, id: string) {
    const grant = this.list(projectId).find(g => g.id === id);
    if (!grant) throw new AppError(404, "连接不存在");
    grant.revokedAt ||= new Date().toISOString();
    this.store.db.prepare("UPDATE agent_connections SET json=? WHERE id=?").run(JSON.stringify(grant), id);
    return grant;
  }
}
