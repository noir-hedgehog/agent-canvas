import type {Entity, Operation} from '../shared/model';
// A browser editing guard, deliberately not a server/project permission.
export function allowedInReadOnly(operations: Operation[], entities: Entity[]): boolean {
  return operations.every(op => {
    const kind = op.op === 'create' ? op.kind : entities.find(e => e.id === op.id)?.kind;
    return (kind === 'annotation' || kind === 'request') && op.op !== 'convert';
  });
}
