import { cardKinds, updateOp, type Entity } from './model';

export type ArchiveFilter = 'active' | 'archived' | 'all';
export const isArchived = (e?: Entity) => e?.data.archived === true;
export const isCard = (e: Entity) => (cardKinds as readonly string[]).includes(e.kind);
export function archiveOperations(entities: Entity[], ids: string[], archived: boolean) {
  const targets = new Map<string, Entity>();
  for (const id of ids) {
    const e = entities.find(e => e.id === id && !e.deleted);
    if (!e || (!isCard(e) && e.kind !== 'request' && e.kind !== 'annotation')) throw new Error('只能归档现有卡片或批注');
    targets.set(e.id, e);
    if (e.kind === 'request' || e.kind === 'annotation') {
      const pair = entities.find(p => !p.deleted && (e.kind === 'request' ? p.id === e.data.annotationId : p.kind === 'request' && p.data.annotationId === e.id));
      if (!pair) throw new Error('批注与请求不完整，请重新读取');
      targets.set(pair.id, pair);
    }
  }
  return [...targets.values()].map(e => updateOp(e, { archived }));
}

// Placements and connections inherit visibility; their geometry is never changed by archiving.
export function matchesArchive(e: Entity, entities: Entity[], filter: ArchiveFilter): boolean {
  if (filter === 'all') return true;
  const byId = new Map(entities.map(e => [e.id, e]));
  const cardArchived = (id: string) => isArchived(byId.get(id));
  const placementArchived = (id: string) => cardArchived(byId.get(id)?.data.objectId);
  const archived = isArchived(e) ||
    (e.kind === 'placement' && cardArchived(e.data.objectId)) ||
    (e.kind === 'relation' && (placementArchived(e.data.sourcePlacementId) || placementArchived(e.data.targetPlacementId))) ||
    (e.kind === 'edge' && (cardArchived(e.data.source) || cardArchived(e.data.target)));
  return filter === 'archived' ? archived : !archived;
}
