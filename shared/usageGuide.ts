import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const skillRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../skills/agent-canvas');
export const usageGuideTopics=['overview','mcp-reference','diagram-patterns','capabilities','examples'] as const;
export type UsageGuideTopic=(typeof usageGuideTopics)[number];
export function readUsageGuide(topic:UsageGuideTopic){
 const files={'overview':'SKILL.md','mcp-reference':'references/mcp-reference.md','diagram-patterns':'references/diagram-patterns.md','capabilities':'references/capabilities.json'};
 const manifest=JSON.parse(readFileSync(path.join(skillRoot,'references/capabilities.json'),'utf8'));
 if(topic==='examples')return {topic,examples:manifest.examples.map((name:string)=>JSON.parse(readFileSync(path.join(skillRoot,'examples',path.basename(name)),'utf8')))};
 if(!Object.hasOwn(files,topic))throw new Error('Unknown guide topic');
 const text=readFileSync(path.join(skillRoot,files[topic]),'utf8');
 return {topic,source:'agent-canvas skill (bundled with this adapter)',...(topic==='capabilities'?{capabilities:JSON.parse(text)}:{text})};
}
