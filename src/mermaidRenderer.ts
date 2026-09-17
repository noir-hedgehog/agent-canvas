import type { Mermaid } from 'mermaid';

export const MAX_MERMAID_LENGTH = 20000;
let engine: Promise<Mermaid> | undefined;
function loadEngine() {
  if (!engine) engine = import('mermaid').then(({default:mermaid}) => {
    mermaid.initialize({
      startOnLoad:false, securityLevel:'strict', theme:'default', layout:'dagre',
      fontFamily:'Arial, sans-serif', htmlLabels:false,
      flowchart:{htmlLabels:false}, maxTextSize:MAX_MERMAID_LENGTH, maxEdges:500,
      suppressErrorRendering:true,
      secure:['secure','securityLevel','startOnLoad','maxTextSize','maxEdges','suppressErrorRendering','htmlLabels','flowchart'],
    });
    return mermaid;
  }).catch(error => { engine=undefined; throw error; });
  return engine;
}

export async function renderMermaid(source: string): Promise<string> {
  if (source.length > MAX_MERMAID_LENGTH) throw new Error('图表超过 20,000 字符，请拆分为多个 Mermaid 代码块');
  if (!source.trim()) throw new Error('Mermaid 代码块为空');
  const mermaid = await loadEngine();
  // Each render owns its temporary DOM, including Mermaid's error output.
  const container=document.createElement('div');
  container.style.cssText='position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;width:1200px';
  document.body.append(container);
  try {
    const {svg}=await mermaid.render(`ac-mermaid-${crypto.randomUUID()}`,source,container);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } finally { container.remove(); }
}
