// Only public answer text is eligible for JSON parsing. Never substitute
// reasoning, tool arguments or refusal text for the model's answer.
export function modelAnswerText(payload:unknown):string {
 const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'?value as Record<string,unknown>:{};
 const textParts=(value:unknown):string=>typeof value==='string'?value:Array.isArray(value)?value.map(part=>{const p=object(part);return ['text','output_text'].includes(String(p.type))&&typeof p.text==='string'?p.text:'';}).join(''):'';
 const root=object(payload);
 const choice=Array.isArray(root.choices)?object(root.choices[0]):{};
 if(root.error||root.status==='incomplete'||root.status==='failed'||choice.finish_reason&&choice.finish_reason!=='stop')return '';
 const content=textParts(object(choice.message).content);
 if(content.trim())return content;
 if(root.status==='incomplete'||root.status==='failed')return '';
 if(typeof root.output_text==='string'&&root.output_text.trim())return root.output_text;
 return Array.isArray(root.output)?root.output.map(item=>{const output=object(item);return output.type==='message'?textParts(output.content):'';}).join(''):'';
}

export class ModelStreamError extends Error {constructor(message:string,readonly transient=false){super(message);}}
// Gate every answer on a terminal success event. HTTP 200 is not evidence that
// inference succeeded: compatible gateways send errors inside their SSE body.
export async function readModelAnswer(response:Response):Promise<string>{
 if(!response.headers.get('content-type')?.includes('text/event-stream'))return modelAnswerText(await response.json());
 if(!response.body)throw new ModelStreamError('AI 网关返回了空响应流，请重试');
 const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',answer='',finished=false;
 function event(block:string){
  const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
  if(!data||data==='[DONE]')return;
  let value;try{value=JSON.parse(data);}catch{throw new ModelStreamError('AI 网关响应流格式错误，请重试');}
  if(value.error||['error','response.failed','response.incomplete'].includes(value.type)){
   const code=value.error?.code??value.response?.error?.code;
   throw new ModelStreamError('上游生成失败，网关未完成本次请求；已确认内容保留，请重试',code==='upstream_error');
  }
  if(value.type==='response.completed'){
   if(value.response?.status&&value.response.status!=='completed')throw new ModelStreamError('AI 返回未完成结果，请重试');
   answer=modelAnswerText(value.response)||answer;finished=true;return;
  }
  if(value.type==='response.output_text.delta')answer+=value.delta??'';
  const choice=value.choices?.[0];
  if(choice?.delta?.refusal)throw new ModelStreamError('AI 未提供有效答案，请检查要求后重试');
  if(typeof choice?.delta?.content==='string')answer+=choice.delta.content;
  if(choice?.finish_reason){if(choice.finish_reason!=='stop')throw new ModelStreamError('AI 输出未完整完成，请重试');finished=true;}
 }
 try{
  while(!finished){const {done,value}=await reader.read();pending=(pending+decoder.decode(value,{stream:!done})).replace(/\r\n/g,'\n');
   let end;while((end=pending.indexOf('\n\n'))>=0){const block=pending.slice(0,end);pending=pending.slice(end+2);event(block);if(finished)break;}
   if(done){if(pending.trim())event(pending);break;}
  }
  if(!finished)throw new ModelStreamError('AI 响应连接提前结束，未收到完整结果，请重试');
  return answer;
 }finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
}
