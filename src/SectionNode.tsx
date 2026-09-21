import {type NodeProps} from '@xyflow/react';
import {Group,Ungroup} from 'lucide-react';
import {Editable} from './Editable';
import {useEditor,useEditorApi} from './state';
import type {CanvasNodeType} from './CanvasNode';
export function SectionNode({data,selected}:NodeProps<CanvasNodeType>){
 const readOnly=useEditor(s=>s.readOnly),store=useEditorApi();
 return <div className={`canvas-section ${selected?'selected':''}`}>
  <div className="section-heading" aria-label={`移动 Section：${data.entity.data.title}`}>
   <Group size={18}/>{readOnly ? <strong>{data.entity.data.title}</strong> : <Editable entity={data.entity} field="title" multiline={false} label="Section 名称"/>}
   <span>{data.entity.data.placementIds.length} 张卡片</span>
   {!readOnly&&<button className="nodrag nopan" aria-label="解除 Section" title="解除分组，保留全部卡片和位置" onClick={async()=>{const e=store.getState().snapshot?.entities.find(e=>e.id===data.entity.id);if(e&&await store.getState().run([{op:'delete',id:e.id,expectedVersion:e.version}],'解除 Section'))store.setState({selected:[]});}}><Ungroup size={16}/></button>}
  </div>
 </div>;
}
