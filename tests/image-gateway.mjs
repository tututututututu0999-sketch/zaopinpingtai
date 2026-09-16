import assert from 'node:assert/strict';
import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url,{alias:{'@':process.cwd()}});
process.env.AI_GATEWAY_BASE_URL='http://image.mock/v1';process.env.AI_GATEWAY_API_KEY='mock-only';
const gateway=await jiti.import('../lib/gateway.ts');let sent;let fail=false;const original=globalThis.fetch;
globalThis.fetch=async(url,options)=>{assert.match(String(url),/images\/edits$/);sent=options.body;return fail?Response.json({error:{message:'mock failure'}},{status:502}):Response.json({data:[{b64_json:'aW1hZ2U='}]});};
try {
 const result=await gateway.editImage('中文设计提示词',[{filename:'ref.png',mimeType:'image/png',content:Buffer.from('preview')}],'1365x1024');
 assert.equal(sent.get('size'),'1536x1152');assert.equal(sent.getAll('image').length,1);assert.equal(sent.get('prompt'),'中文设计提示词');assert.match(result.imageUrl,/^data:image\/png;base64,/);
 const route=await jiti.import('../app/api/images/generate/route.ts');
 assert.equal((await route.POST(new Request('http://test',{method:'POST',body:'{'}))).status,400);
 assert.equal((await route.POST(new Request('http://test',{method:'POST',body:JSON.stringify({taskId:'not-used',size:'1366x1024'})}))).status,400);
 fail=true;await assert.rejects(()=>gateway.editImage('prompt',[{filename:'ref.png',mimeType:'image/png',content:Buffer.from('preview')}],'1152x1536'),/502/);
 assert.equal(sent.get('size'),'1152x1536');console.log('PASS image2 multipart: corrected sizes, reference bytes, prompt, success parsing, failure reporting; no paid API calls');
}finally{globalThis.fetch=original;}
