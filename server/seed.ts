import type {Store} from './store.ts';
import {showcaseOperations,showcaseTitle} from '../shared/showcase.ts';
export function seed(store:Store) {
 if(store.projects().length)return;
 const project=store.newProject(showcaseTitle,true);
 store.apply({projectId:project.id,requestId:crypto.randomUUID(),summary:'创建公开功能示例',operations:showcaseOperations(project.rootCanvasId)});
}
