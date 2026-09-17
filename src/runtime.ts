export const DEMO_MODE = import.meta.env?.MODE === 'demo';
export function assetUrl(projectId:string,id:string) {
 if(DEMO_MODE) return localStorage.getItem(`ac-demo-asset:${id}`) || `${(import.meta.env?.BASE_URL || '/')}demo-assets/${id}`;
 return `/assets-file/${projectId}/${id}`;
}
export function fileUrl(projectId:string,id:string) {
 return DEMO_MODE ? `${(import.meta.env?.BASE_URL || '/')}demo-assets/${id}` : `/api/projects/${projectId}/files/${id}/content`;
}
