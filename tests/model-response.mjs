import assert from 'node:assert/strict';
import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url,{alias:{'@':process.cwd()}});
const {modelAnswerText,readModelAnswer}=await jiti.import('../lib/model-response.ts');
const stream=events=>new Response(events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
assert.equal(await readModelAnswer(stream([{choices:[{delta:{content:'{"ok":true}'},finish_reason:'stop'}]}])), '{"ok":true}');
assert.equal(await readModelAnswer(stream([{type:'response.output_text.delta',delta:'answer'},{type:'response.completed',response:{status:'completed'}}])), 'answer');
await assert.rejects(()=>readModelAnswer(stream([{type:'response.output_text.delta',delta:'partial'},{type:'response.failed',response:{error:{code:'upstream_error'}}}])),/上游生成失败/);
await assert.rejects(()=>readModelAnswer(stream([{choices:[{delta:{content:'partial'},finish_reason:'length'}]}])),/未完整/);
await assert.rejects(()=>readModelAnswer(stream([{choices:[{delta:{content:'partial'}}]}])),/提前结束/);
await assert.rejects(()=>readModelAnswer(stream([{error:{code:'upstream_error'}}])),/上游生成失败/);
const answer={prompt:'英语礼盒封面，突出主标题与四组卖点。',negativePrompt:'错误文字'};
assert.equal(modelAnswerText({choices:[{message:{content:[{type:'text',text:JSON.stringify(answer)}]}}]}),JSON.stringify(answer));
assert.equal(modelAnswerText({output:[{type:'reasoning',content:[{type:'output_text',text:'private'}]},{type:'message',content:[{type:'output_text',text:'answer'}]}]}),'answer');
assert.equal(modelAnswerText({status:'incomplete',output_text:'partial'}),'');
assert.equal(modelAnswerText({choices:[{message:{reasoning_content:'private',refusal:'no'}}]}),'');
process.env.AI_GATEWAY_BASE_URL='http://gateway.mock/v1';process.env.AI_GATEWAY_API_KEY='mock';
const {composeImagePrompt}=await jiti.import('../lib/gateway.ts');
const original=globalThis.fetch;let calls=[];
try{
 globalThis.fetch=async(url,options)=>{calls.push({url:String(url),body:JSON.parse(options.body)});return calls.length===1?Response.json({choices:[{message:{content:''}}]}):Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answer)}]}]});};
 const result=await composeImagePrompt({analysis:{designDirection:'英语礼盒'},report:{summary:'参考'},primaryDescription:'版式',helperDescriptions:[]});
 assert.equal(result.prompt,answer.prompt);assert.equal(calls.length,2);assert.match(calls[1].url,/\/responses$/);assert.equal(calls[0].body.stream,true);assert.ok(calls[1].body.input[1].content[0].text.includes('英语礼盒'));
 calls=[];globalThis.fetch=async()=>{calls.push(1);return Response.json({},{status:401});};
 await assert.rejects(()=>composeImagePrompt({analysis:{hardConstraints:[],mustAvoid:[]}}),/授权失败/);assert.equal(calls.length,1);
 calls=[];globalThis.fetch=async()=>{calls.push(1);return calls.length===1?stream([{error:{code:'upstream_error'}}]):Response.json({choices:[{message:{content:JSON.stringify(answer)}}]});};
 assert.equal((await composeImagePrompt({analysis:{hardConstraints:[],mustAvoid:[]}})).prompt,answer.prompt);assert.equal(calls.length,2);
 calls=[];globalThis.fetch=async()=>{calls.push(1);return Response.json({choices:[{message:{content:null}}]});};
 await assert.rejects(()=>composeImagePrompt({analysis:{hardConstraints:[],mustAvoid:[]}}),/未返回有效/);assert.equal(calls.length,2);
 calls=[];globalThis.fetch=async()=>{calls.push(1);throw new TypeError('connection closed');};
 await assert.rejects(()=>composeImagePrompt({analysis:{hardConstraints:[],mustAvoid:[]}}),/无法连接/);assert.equal(calls.length,1,'network failures must not silently restart a long wait');
 const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
 try{calls=[];globalThis.fetch=async()=>{calls.push(1);clock+=61_000;return Response.json({choices:[{message:{content:''}}]});};await assert.rejects(()=>composeImagePrompt({analysis:{hardConstraints:[],mustAvoid:[]}}),/超过60秒/);assert.equal(calls.length,1,'protocol fallback shares the same deadline');}finally{Date.now=realNow;}
 console.log('PASS answer formats, reasoning exclusion, empty-chat Responses recovery, bounded retries, no retry on authorization failure');
}finally{globalThis.fetch=original;}
