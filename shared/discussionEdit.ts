import { updateOp, type Entity } from './model';
import { discussionHandoffText } from './debugDiscussion';

export const discussionStates = { pending: '待处理', processing: '处理中', replied: '已回复', failed: '失败', resolved: '已解决' };
export function discussionStatusOperations(request: Entity, annotation: Entity, state: keyof typeof discussionStates) {
  if (request.data.annotationId !== annotation.id) throw new Error('批注与请求不匹配');
  if (state === 'resolved') return [updateOp(annotation, { state: 'resolved' })];
  return [updateOp(annotation, { state: 'open' }), updateOp(request, { state })];
}
export function unresolvedDiscussions(entities: Entity[]) {
  const annotations = new Map(entities.filter(e => e.kind === 'annotation' && !e.deleted && !e.data.archived).map(e => [e.id, e]));
  return entities.filter(e => e.kind === 'request' && !e.deleted && !e.data.archived && annotations.get(e.data.annotationId)?.data.state === 'open');
}
export function discussionsHandoffText(requests: Entity[]) {
  return `请逐条处理以下 ${requests.length} 条未解决批注。先通过 MCP 读取每条请求的最新状态；若已解决或已归档则跳过，完成后分别回复。保留用户布局。\n\n` + requests.map((r, i) => `【${i + 1} / ${requests.length}】\n${discussionHandoffText(r)}${r.data.debugContext || r.data.mediaContext ? '' : `\n\n用户批注：${r.data.instruction}`}`).join('\n\n---\n\n');
}

export function discussionEditOperations(request: Entity, annotation: Entity, body: string) {
  const instruction = body.trim();
  if (!instruction) throw new Error('批注内容不能为空');
  if (request.data.annotationId !== annotation.id) throw new Error('批注与请求不匹配');
  return [
    updateOp(annotation, { body: instruction, state: 'open' }),
    updateOp(request, { instruction, state: 'pending' }),
  ];
}
