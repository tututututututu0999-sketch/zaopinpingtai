// Tests real pixel understanding and JSON generation; no image generation.
import sharp from 'sharp';
const base=process.env.AI_GATEWAY_BASE_URL?.replace(/\/$/,'');if(!base)throw new Error('Gateway not configured');
const root=base.endsWith('/v1')?base:base+'/v1';
const image=await sharp(Buffer.from('<svg width="480" height="160" xmlns="http://www.w3.org/2000/svg"><rect width="480" height="160" fill="white"/><circle cx="80" cy="80" r="48" fill="#e52222"/><rect x="190" y="32" width="96" height="96" fill="#13a144"/><path d="M400 25 L455 130 L345 130Z" fill="#174be6"/></svg>')).png().toBuffer();
const prompt='Identify the three large colored shapes from left to right in the attached image. Return JSON only: {"colors":[English lowercase color names],"shapes":[English lowercase singular shape names]}. Do not guess if the image cannot be seen.';
const models=process.argv.slice(2).length?process.argv.slice(2):['gpt-5.6-luna','gpt-5.6-terra','qwen-3.8-free'];
function textOf(payload){return payload.choices?.[0]?.message?.content||payload.output_text||payload.output?.filter(item=>item.type==='message').flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text).join('')||'';}
async function run(model,protocol){const start=Date.now();const isChat=protocol==='chat';let requestId;
 try{const r=await fetch(root+(isChat?'/chat/completions':'/responses'),{method:'POST',headers:{Authorization:'Bearer '+process.env.AI_GATEWAY_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(isChat?{model,stream:true,messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:`data:image/png;base64,${image.toString('base64')}`}}]}]}:{model,stream:true,input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:`data:image/png;base64,${image.toString('base64')}`}]}]}),signal:AbortSignal.timeout(45000)});requestId=r.headers.get('x-request-id');const raw=await r.text();let answer='',complete=false,errorCode='';
 if(r.headers.get('content-type')?.includes('text/event-stream')){for(const line of raw.split('\n'))if(line.startsWith('data:')){try{const p=JSON.parse(line.slice(5));if(p.error||p.type==='response.failed')errorCode=p.error?.code||p.response?.error?.code||'upstream_error';if(p.type==='response.output_text.delta')answer+=p.delta;answer+=p.choices?.[0]?.delta?.content||'';if(p.type==='response.completed'){complete=true;answer=textOf(p.response)||answer;}if(p.choices?.[0]?.finish_reason==='stop')complete=true;}catch{}}}
 else{const p=JSON.parse(raw);answer=textOf(p);complete=Boolean(answer);errorCode=p.error?.code||'';}
 let actual;try{actual=JSON.parse(answer.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{}
 const passed=r.ok&&complete&&!errorCode&&JSON.stringify(actual?.colors)===JSON.stringify(['red','green','blue'])&&JSON.stringify(actual?.shapes)===JSON.stringify(['circle','square','triangle']);
 return {model,protocol,passed,status:r.status,ms:Date.now()-start,error:errorCode||(!complete?'incomplete':!passed?'vision_answer_mismatch':undefined),observed:actual,requestId};
 }catch(e){return {model,protocol,passed:false,ms:Date.now()-start,error:e.name};}
}
await Promise.allSettled(models.map(async model=>{let result=await run(model,'responses');console.log(JSON.stringify(result));if(!result.passed){result=await run(model,'chat');console.log(JSON.stringify(result));}}));
