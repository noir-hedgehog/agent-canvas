import { randomUUID } from 'node:crypto';
import { realpathSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileFormat, type FileReference } from '../shared/fileReferences';
import { Store, AppError } from './store';

export class FileReferences {
  constructor(private store: Store, private workspace: string, private dataDir: string) {}
  register(projectId: string, source: string, actor: string, id: string = randomUUID()): FileReference {
    this.store.project(projectId);
    const existing = this.store.db.prepare('SELECT json FROM file_references WHERE id=? AND project_id=?').get(id, projectId);
    if (existing) {
      const previous = JSON.parse(existing.json as string) as FileReference & { requestedSource?: string };
      if (previous.requestedSource !== source && previous.source !== source) throw new AppError(409, '引用请求 ID 已用于另一个文件');
      return previous;
    }
    const requestedSource = source;
    let remote = false, size: number | undefined, modifiedAt: number | undefined;
    let name: string;
    if (/^https?:\/\//i.test(source)) {
      const url = new URL(source);
      if (url.username || url.password) throw new AppError(400, '文件链接不能包含账号口令');
      remote = true;
      name = decodeURIComponent(url.pathname.split('/').pop() || '文件');
    } else {
      if (/^[a-z]+:\/\//i.test(source)) throw new AppError(400, '请输入本地路径或 HTTP(S) 文件链接');
      source = this.localPath(source, actor);
      const stat = statSync(source);
      if (!stat.isFile()) throw new AppError(400, '请选择文件');
      size = stat.size; modifiedAt = stat.mtimeMs;
      name = path.basename(source);
    }
    const format = fileFormat(source);
    if (!format) throw new AppError(400, '支持 PNG/JPEG/GIF/WebP、MP4/WebM/MOV 和 Markdown 文件');
    if (format.mediaType === 'markdown' && size && size > 2 * 1024 * 1024) throw new AppError(413, 'Markdown 文件上限为 2 MB');
    const reference: FileReference = { id, projectId, source, name, remote, size, modifiedAt, ...format };
    this.store.db.prepare('INSERT INTO file_references(id,project_id,json) VALUES(?,?,?)').run(id, projectId, JSON.stringify({...reference,requestedSource}));
    return reference;
  }
  private localPath(source: string, actor: string) {
    let file: string;
    try { file = realpathSync(path.resolve(this.workspace, source)); }
    catch { throw new AppError(404, '原文件不存在，请检查路径或重新关联'); }
    const root = realpathSync(this.workspace), data = realpathSync(this.dataDir);
    if (file === data || file.startsWith(data + path.sep)) throw new AppError(403, '不能引用应用私有数据目录');
    if (actor !== 'human' && !file.startsWith(root + path.sep)) throw new AppError(403, 'Agent 只能新建工作区内文件引用；其他本地文件请在画布中添加');
    return file;
  }
  get(projectId: string, id: string): FileReference {
    this.store.project(projectId);
    const row = this.store.db.prepare('SELECT json FROM file_references WHERE id=? AND project_id=?').get(id, projectId);
    if (!row) throw new AppError(404, '文件引用不存在');
    return JSON.parse(row.json as string);
  }
  current(projectId: string, id: string): FileReference {
    const ref = this.get(projectId, id);
    if (ref.remote) return ref;
    // A moved/replaced symlink must not silently grant access to a different path.
    const current = this.localPath(ref.source, 'human');
    if (current !== ref.source) throw new AppError(409, '文件指向已变化，请重新关联');
    const stat = statSync(current);
    if (!stat.isFile()) throw new AppError(404, '原文件已不可用，请重新关联');
    return { ...ref, size: stat.size, modifiedAt: stat.mtimeMs };
  }
  read(projectId: string, id: string) {
    const ref = this.current(projectId, id);
    if (ref.remote || ref.mediaType === 'video') return { reference: ref };
    if (ref.size! > (ref.mediaType === 'image' ? 6 : 2) * 1024 * 1024) throw new AppError(413, '文件过大，请使用预览链接');
    const content = readFileSync(ref.source);
    return ref.mediaType === 'markdown' ? { reference: ref, text: content.toString('utf8') } : { reference: ref, base64: content.toString('base64') };
  }
}
