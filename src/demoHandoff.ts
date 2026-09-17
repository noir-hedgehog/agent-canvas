import {DEMO_MODE} from './runtime';
import type {Entity} from '../shared/model';
import {discussionHandoffText as localHandoff} from '../shared/debugDiscussion';
export function discussionHandoffText(request:Entity):string {
 return DEMO_MODE ? `这是 AgentCanvas 网页演示的浏览器批注，未连接 MCP，以下 ID 不对应本地项目。请仅根据文本讨论，不要尝试修改本地对象。\n\n${request.data.instruction}\n\n${JSON.stringify(request.data,null,2)}` : localHandoff(request);
}
