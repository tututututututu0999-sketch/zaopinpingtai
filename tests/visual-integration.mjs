import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import sharp from 'sharp';
import {createJiti} from 'jiti';
import {Readable} from 'node:stream';
import {migrate} from '../scripts/migrate.mjs';
import {emptyProfile,RULE_VERSION} from '../visual-rules/v1/index.mjs';
import {GENERATION_RULE_VERSION} from '../visual-rules/generation.mjs';
import {analyseVisual,embedVisual} from '../visual-rules/v1/worker.mjs';

// All writes are isolated in a uniquely named test schema, never the public catalog.
const base=process.env.DATABASE_URL;if(!base)throw new Error('DATABASE_URL is required');
const admin=new pg.Pool({connectionString:base});const schema=`visual_test_${crypto.randomUUID().replaceAll('-','')}`;
await admin.query(`CREATE SCHEMA ${schema}`);
const url=new URL(base);url.searchParams.set('options',`-c search_path=${schema},public`);process.env.DATABASE_URL=url.toString();
process.env.EMBEDDING_SERVICE_URL='http://embedding.mock';process.env.AI_GATEWAY_BASE_URL='http://gateway.mock';process.env.AI_GATEWAY_API_KEY='test-only';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});const jiti=createJiti(import.meta.url,{alias:{'@':process.cwd()}});
const vector=Array.from({length:1024},(_,index)=>index===0?1:0);const literal=`[${vector}]`;
const profile=emptyProfile();for(const group of Object.values(profile)){group.status='OBSERVED';group.confidence=.9;group.evidence='可见视觉结构';}
profile.subject.types=['二维插画'];profile.title.types=['ROUNDED_OUTLINE'];profile.selling.types=['A'];profile.selling.count='4';
let revised=false;let reportInput;let revisionInput;let malformedOnce=false;
let imageBytes;const imageRequests=[];const visionModels=[];
const mockBrief=()=>({materialType:'礼盒',grade:'二年级',subject:'数学',productLine:'学习礼盒',audience:'二年级学生',intent:'数学伴读',usageScenario:'家庭学习',productValue:'掌握知识',emotionalValue:'陪伴成长',designDirection:revised?'插画互动伴读礼盒':'真人肖像互动伴读礼盒',designKeywords:['正式','活力','成就'],styleKeywords:[],colorKeywords:[],mustAvoid:revised?['真人']:[],searchQuery:'数学礼盒',assumptions:[],preferences:{title:[],selling:[],subject:[]},hardConstraints:revised?[{field:'subject',operator:'exclude',value:'真人肖像',evidence:'不要真人'}]:[],unsupportedConstraints:[]});
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
 if(String(input).endsWith('/images/edits')){imageRequests.push(options.body);return Response.json({data:[{b64_json:imageBytes.toString('base64')}]});}
 if(String(input).endsWith('/images/generations')){imageRequests.push(JSON.parse(options.body));return Response.json({data:[{b64_json:imageBytes.toString('base64')}]});}
 const url=String(input);const body=options?.body?JSON.parse(options.body):{};
 if(url.endsWith('/health'))return Response.json({status:'ok'});
 if(url.endsWith('/responses')){
  const system=body.input?.[0]?.content;
  if(Array.isArray(system))visionModels.push(body.model);
  const result=typeof system==='string'?(system.includes(GENERATION_RULE_VERSION)?{prompt:'保留已确认标题与四栏卖点',negativePrompt:'错误文字'}:{summary:'采用标题和卖点结构',reasons:['结构匹配'],reusableElements:['描边标题'],riskNotes:[]}):profile;
  return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]});
 }
 if(url.endsWith('/embed'))return Response.json({dimensions:1024,embedding:vector,serializedContent:body.sections?.join('\n')||body.content});
 if(url.endsWith('/chat/completions')){
  const system=body.messages[0].content;let result;
  if(malformedOnce){malformedOnce=false;return Response.json({choices:[{message:{content:'{"broken":true,}'}}]});}
  if(system.includes('需求分析与产品策划')){revised=body.messages[1].content.includes('不要真人');result=mockBrief();}
  else if(system.includes(GENERATION_RULE_VERSION)){revisionInput=JSON.parse(body.messages[1].content);result={prompt:`按历史版本改图，保留标题与卖点结构。${revisionInput.uploadedReferences?.some(ref=>ref.role==='character')?'必须使用上传IP作为清晰可见的封面主体。':''}`,negativePrompt:'错误文字'};}
  else{reportInput=JSON.parse(body.messages[1].content);result={summary:'标题与卖点结构',reasons:['结构匹配'],reusableElements:['描边标题'],riskNotes:['不能复制品牌']};}
  return Response.json({choices:[{message:{content:JSON.stringify(result)}}]});
 }throw new Error(`Unexpected network call: ${url}`);
};
let appDb;
try{
 await pool.query(await readFile(new URL('../prisma/init/01-vector.sql',import.meta.url),'utf8'));await migrate(pool);await migrate(pool);
 for(const id of ['gpt-5.6-luna','gpt-5.6-terra'])await pool.query('INSERT INTO text_model_checks(model_id,result) VALUES($1,$2::jsonb)',[id,JSON.stringify({id,available:true,vision:true,protocol:'responses'})]);
 const archive=await jiti.import('../lib/visual-revisions.ts');const briefs=await jiti.import('../lib/brief-drafts.ts');const retrieval=await jiti.import('../lib/real-retrieval.ts');const tasks=await jiti.import('../lib/design-tasks.ts');appDb=await jiti.import('../lib/db.ts');
 malformedOnce=true;
 const unspecified=await briefs.analyseDraft({brief:'外教伴读礼盒'});
 assert.equal(unspecified.grade,'未指定');assert.equal(unspecified.subject,'未指定');
 const project=(await pool.query("INSERT INTO projects(name) VALUES('隔离测试项目') RETURNING id")).rows[0].id;
 const suite=(await pool.query("INSERT INTO visual_suites(project_id,name) VALUES($1,'测试套系') RETURNING id",[project])).rows[0].id;
 const assets=[];
 for(let index=0;index<303;index++){
  const row=(await pool.query(`INSERT INTO assets(checksum,filename,display_name,source_key,preview_key,mime_type,suite_id,material_type,grade,subject,review_state,reuse_state,embedding_status,description) VALUES($1,$2,$2,'source.ai','preview.jpg','image/png',$3,'GIFT_BOX',$4,'数学','CONFIRMED','REUSABLE','READY','旧版设计描述') RETURNING id`,[`test-${index}`,`图${index}.png`,suite,index<3?'二年级':'三年级'])).rows[0];assets.push(row.id);await pool.query("INSERT INTO asset_embeddings(asset_id,text_embedding,image_embedding,model_name) VALUES($1,$2::vector,$2::vector,'test')",[row.id,literal]);
 }
 await pool.query('UPDATE visual_suites SET primary_asset_id=$2 WHERE id=$1',[suite,assets[0]]);
 const first=await briefs.analyseDraft({brief:'二年级数学外教伴读礼盒'});assert.equal(first.revision,1);
 await assert.rejects(()=>briefs.getConfirmedBrief(first.draftId,1));
 await pool.query("UPDATE brief_revisions SET analysis=jsonb_set(analysis,'{unsupportedConstraints}',$2::jsonb) WHERE draft_id=$1",[first.draftId,JSON.stringify(['用户未明确要求平面或立体设计形式，无法验证'])]);
 assert.deepEqual((await briefs.confirmBrief(first.draftId,1)).unsupportedConstraints,[]);
 assert.deepEqual((await briefs.getConfirmedBrief(first.draftId,1)).unsupportedConstraints,[]);
 let candidates=await retrieval.retrieveVectorCandidateSuites(first);assert.equal(candidates.length,1);assert.equal(candidates[0].primary.id,assets[0]);assert.equal(candidates[0].helpers.length,2);assert.ok(candidates[0].helpers.every(row=>row.grade==='二年级'));
 await pool.query("UPDATE assets SET subject='全科' WHERE id=$1",[assets[0]]);
 assert.equal((await retrieval.retrieveVectorCandidateSuites({...first,subject:'语文'}))[0].primary.id,assets[0],'all-subject covers enter subject-specific retrieval');
 await pool.query("UPDATE assets SET subject='数学' WHERE id=$1",[assets[0]]);
 assert.equal((await retrieval.retrieveVectorCandidateSuites({...first,subject:'语文'})).length,0,'specific unrelated subject is still filtered');
 const job=await archive.queueVisualUpgrade([assets[0]]);assert.equal(job.queued,1);assert.equal((await archive.queueVisualUpgrade([assets[0]])).queued,0);
 let rev=(await archive.listVisualRevisions())[0];const image=await sharp({create:{width:8,height:8,channels:3,background:'#fff'}}).png().toBuffer();
 imageBytes=image;
 await analyseVisual(pool,async()=>image,async()=>profile,rev.id);rev=(await archive.listVisualRevisions())[0];assert.equal(rev.status,'PENDING');
 assert.equal((await pool.query('SELECT description FROM assets WHERE id=$1',[assets[0]])).rows[0].description,'旧版设计描述');
 assert.equal((await pool.query('SELECT visual_revision_id FROM asset_embeddings WHERE asset_id=$1',[assets[0]])).rows[0].visual_revision_id,null);
 await pool.query("UPDATE assets SET reuse_state='ADAPT_REQUIRED' WHERE id=$1",[assets[0]]);
 await archive.confirmVisualRevisions([{id:rev.id,profile,adaptationNotes:'替换品牌文字与未授权角色'}]);
 await assert.rejects(()=>embedVisual(pool,async()=>image,async()=>{throw new Error('mock image embedding failure');},rev.id));
 assert.equal((await pool.query('SELECT visual_revision_id FROM asset_embeddings WHERE asset_id=$1',[assets[0]])).rows[0].visual_revision_id,null);
 await embedVisual(pool,async()=>image,async()=>vector,rev.id);assert.equal((await archive.listVisualRevisions())[0].status,'READY');
 const titleQuery={...first,preferences:{title:['ROUNDED_OUTLINE'],selling:['A'],subject:[]},hardConstraints:[{field:'selling.count',operator:'include',value:'4',evidence:'四栏卖点'}]};
 assert.equal((await retrieval.retrieveVectorCandidateSuites(titleQuery))[0].primary.id,assets[0]);
 await pool.query("UPDATE assets SET material_type='BOOK_COVER',subject='英语' WHERE id=$1",[assets[1]]);
 assert.equal((await retrieval.retrieveVectorCandidateSuites({...first,materialType:'主书封面',subject:'英语'}))[0].helpers[0].id,assets[1]);
 await pool.query("UPDATE assets SET material_type='PRODUCT_BOOKLET' WHERE id=$1",[assets[2]]);
 assert.equal((await retrieval.retrieveVectorCandidateSuites({...first,materialType:'产品说明书'}))[0].helpers[0].id,assets[2]);
 const task=await tasks.createDesignTask({brief:first.originalBrief,analysis:first,referenceAssetIds:[assets[0]],draftId:first.draftId,revision:1});assert.equal((await tasks.taskContext(task.id)).reference_snapshot[0].visual_revision_id,rev.id);
 const reportRoute=await jiti.import('../app/api/brief/report/route.ts');const report=await reportRoute.POST(new Request('http://test/api/brief/report',{method:'POST',body:JSON.stringify({taskId:task.id,primaryDescription:'恶意覆盖文本'})}));assert.equal(report.status,200);assert.ok(reportInput.primaryDescription.includes('替换品牌'));assert.ok(!reportInput.primaryDescription.includes('恶意覆盖'));
 const reportData=await report.json();
 await tasks.updateDesignTask(task.id,{status:'REPORT_READY',report:reportData});
 await tasks.updateDesignTask(task.id,{status:'REPORT_READY',report:reportData});
 const statusModule=await jiti.import('../lib/archive-status.ts');
 const initialStatus=await statusModule.archiveStatus();assert.equal(initialStatus.total,303);assert.equal(initialStatus.indexed,303);assert.equal(initialStatus.searchable,303);
 // A project without vectors/primary remains visible in coverage, but cannot
 // falsely inflate the indexed or searchable counts.
 const waitingProject=(await pool.query("INSERT INTO projects(name) VALUES('待索引项目') RETURNING id")).rows[0].id;
 const waitingSuite=(await pool.query("INSERT INTO visual_suites(project_id,name) VALUES($1,'待索引套系') RETURNING id",[waitingProject])).rows[0].id;
 await pool.query("INSERT INTO assets(checksum,filename,source_key,mime_type,suite_id,review_state,embedding_status) VALUES('waiting-count','等待.png','waiting','image/png',$1,'CONFIRMED','WAITING_VISUAL')",[waitingSuite]);
 const coverage=await statusModule.archiveStatus();assert.equal(coverage.total,304);assert.equal(coverage.indexed,303);assert.equal(coverage.projects.find(p=>p.id===waitingProject).missingPrimary,1);
 // A second qualifying project is recalled; lack of a main vector removes it
 // from both retrieval and coverage even if its READY flag is stale.
 const other=(await pool.query("UPDATE assets SET preview_key='preview.jpg',material_type='GIFT_BOX',grade='二年级',subject='数学',embedding_status='READY' WHERE suite_id=$1 RETURNING id",[waitingSuite])).rows[0].id;
 await pool.query('UPDATE visual_suites SET primary_asset_id=$2 WHERE id=$1',[waitingSuite,other]);
 assert.equal((await retrieval.retrieveVectorCandidateSuites(first)).length,1);
 await pool.query("INSERT INTO asset_embeddings(asset_id,text_embedding,image_embedding,model_name) VALUES($1,$2::vector,$2::vector,'test')",[other,literal]);
 assert.deepEqual(new Set((await retrieval.retrieveVectorCandidateSuites(first)).map(item=>item.projectId)),new Set([project,waitingProject]));
 assert.equal((await statusModule.archiveStatus()).searchable,304);
 await pool.query('DELETE FROM asset_embeddings WHERE asset_id=$1',[other]);
 assert.equal((await statusModule.archiveStatus()).searchable,303);
 assert.equal((await retrieval.retrieveVectorCandidateSuites(first)).length,1);
 const promptData={source:'terra',prompt:'礼盒封面设计',negativePrompt:'错误文字'};
 await tasks.updateDesignTask(task.id,{status:'PROMPT_DRAFT',prompt:promptData});
 await tasks.updateDesignTask(task.id,{status:'PROMPT_DRAFT',prompt:promptData});
 await pool.query("UPDATE design_tasks SET status='GENERATION_FAILED' WHERE id=$1",[task.id]);
 assert.equal((await tasks.updateDesignTask(task.id,{status:'PROMPT_DRAFT',prompt:promptData})).status,'PROMPT_DRAFT');
 // Exercise the actual generate route and multipart image upload without paid
 // requests or object-store writes. All DB records stay in this test schema.
 process.env.S3_ENDPOINT='http://store.mock';process.env.S3_ACCESS_KEY='mock';process.env.S3_SECRET_KEY='mock';
 const storage=await jiti.import('../lib/storage.ts');const store=storage.objectStore();
 store.bucketExists=async()=>true;store.getObject=async()=>Readable.from([image]);store.putObject=async()=>({etag:'mock',versionId:null});
 const generateRoute=await jiti.import('../app/api/images/generate/route.ts');
 const generate=async draft=>{await tasks.updateDesignTask(task.id,{status:'PROMPT_CONFIRMED',prompt:draft});const response=await generateRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({taskId:task.id,size:'1024x1536'})}));const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;};
 const v1=await generate(promptData);assert.equal(imageRequests.at(-1).getAll('image').length,1);
 const v2=await generate(promptData);assert.equal(imageRequests.at(-1).getAll('image').length,1,'regeneration must not silently add previous output');
 const v3=await generate({...promptData,editBaseVersionId:v1.versionId});assert.equal(imageRequests.at(-1).getAll('image').length,2);assert.equal(imageRequests.at(-1).getAll('image')[0].name,'edit-base.png');
 const trace=(await pool.query('SELECT prompt,source_keys FROM design_versions WHERE id=$1',[v3.versionId])).rows[0];assert.equal(trace.prompt.prompt,promptData.prompt);assert.ok(Array.from(trace.prompt.compiledPrompt).length<=2000);assert.match(trace.prompt.compiledPrompt,/图1：改图底图/);assert.ok(trace.source_keys[0].includes(v1.versionId));
 await tasks.confirmGeneratedReference(task.id,v1.versionId);assert.ok((await pool.query('SELECT generation_key FROM design_tasks WHERE id=$1',[task.id])).rows[0].generation_key.includes(v1.versionId));
 await assert.rejects(()=>tasks.confirmGeneratedReference(task.id,crypto.randomUUID()),/成功生成/);
 const modelTask=await tasks.createDesignTask({brief:first.originalBrief,analysis:first,referenceAssetIds:[assets[0]],draftId:first.draftId,revision:1,textModel:'gpt-5.6-luna'});
 assert.equal((await tasks.taskContext(modelTask.id)).analysis.textModel,'gpt-5.6-luna');
 const selectedFetch=globalThis.fetch;const selectedCalls=[];
 globalThis.fetch=async(url,options)=>{selectedCalls.push({url:String(url),model:JSON.parse(options.body).model});if(selectedCalls.length===1)return Response.json({error:'upstream unavailable'},{status:503});return selectedFetch(url,options);};
 const lunaReportResponse=await reportRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({taskId:modelTask.id})}));
 globalThis.fetch=selectedFetch;
 assert.deepEqual(selectedCalls.map(call=>new URL(call.url).pathname),['/v1/responses','/v1/chat/completions']);assert.ok(selectedCalls.every(call=>call.model==='gpt-5.6-luna'),'protocol recovery must not switch models');
 const lunaReport=await lunaReportResponse.json();assert.equal(lunaReportResponse.status,200,JSON.stringify(lunaReport));assert.equal(lunaReport.model,'gpt-5.6-luna');
 await tasks.updateDesignTask(modelTask.id,{report:lunaReport,status:'REPORT_READY'});
 const modelPromptRoute=await jiti.import('../app/api/brief/prompt/route.ts');const modelPromptResponse=await modelPromptRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({taskId:modelTask.id})}));
 const modelPrompt=await modelPromptResponse.json();assert.equal(modelPromptResponse.status,200,JSON.stringify(modelPrompt));assert.equal(modelPrompt.model,'gpt-5.6-luna');
 await tasks.changeTaskModel(modelTask.id,'gpt-5.6-terra');assert.equal((await tasks.taskContext(modelTask.id)).analysis.textModel,'gpt-5.6-terra');
 await assert.rejects(()=>tasks.updateDesignTask(modelTask.id,{report:lunaReport,status:'REPORT_READY'}),/版本已变化/);
 await assert.rejects(()=>tasks.changeTaskModel(modelTask.id,'deepseek-v4-flash'),/支持的文本模型/);
 await assert.rejects(()=>tasks.changeTaskModel(modelTask.id,'arbitrary-model'),/支持的文本模型/);
 await tasks.updateDesignTask(task.id,{status:'PROMPT_DRAFT',prompt:{...promptData,prompt:'最新版本提示词，不应用于修改历史版本'}});
 const reviseRoute=await jiti.import('../app/api/brief/prompt/revise/route.ts');
 const revisedResponse=await reviseRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({taskId:task.id,baseVersionId:v1.versionId,instruction:'保留版式，更换标题颜色'})}));
 const revisedPrompt=await revisedResponse.json();assert.equal(revisedResponse.status,200,JSON.stringify(revisedPrompt));assert.equal(revisedPrompt.editBaseVersionId,v1.versionId);assert.equal(revisionInput.current.prompt,promptData.prompt,'revision must use the selected historical prompt');
 await tasks.updateDesignTask(task.id,{status:'PROMPT_CONFIRMED',prompt:{...promptData,prompt:'长'.repeat(2001)}});
 const rejected=await generateRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({taskId:task.id})}));assert.match((await rejected.json()).error,/超过2000/);assert.equal(imageRequests.length,3);
 // Upload before prompt composition, retain explicit IP identity in the actual multipart request.
 const uploadRoute=await jiti.import('../app/api/design-tasks/[id]/references/route.ts');
 const form=new FormData();form.append('files',new File([image],'character.png',{type:'image/png'}));form.append('role','character');form.append('note','保留帽子');
 const uploadResponse=await uploadRoute.POST(new Request('http://test',{method:'POST',body:form}),{params:Promise.resolve({id:task.id})});
 const uploaded=await uploadResponse.json();assert.equal(uploadResponse.status,201,JSON.stringify(uploaded));assert.equal(uploaded[0].role,'character');
 assert.equal((await pool.query('SELECT prompt FROM design_tasks WHERE id=$1',[task.id])).rows[0].prompt,null);
 const previousModelInput=revisionInput;
 const directResponse=await reviseRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({taskId:task.id,baseVersionId:v1.versionId,instruction:'卖点小一点',mode:'direct'})}));
 const direct=await directResponse.json();assert.equal(directResponse.status,200,JSON.stringify(direct));assert.equal(direct.revisionMode,'direct');assert.equal(revisionInput,previousModelInput,'direct edits must not call Terra');assert.match(direct.prompt,/卖点小一点/);
 await tasks.updateDesignTask(task.id,{status:'PROMPT_DRAFT',prompt:direct});
 assert.equal(direct.prompt,'卖点小一点');assert.equal(direct.negativePrompt,'');assert.equal(direct.size,'1024x1536');
 const editedResult=await generate(direct);const directRequest=imageRequests.at(-1);
 assert.equal(directRequest.getAll('image').length,1);assert.equal(directRequest.getAll('image')[0].name,'edit-base.png');
 assert.deepEqual(Buffer.from(await directRequest.getAll('image')[0].arrayBuffer()),image);
 assert.equal(directRequest.get('prompt'),direct.compiledPrompt);assert.doesNotMatch(directRequest.get('prompt'),/礼盒封面设计|卖点继承|配色优先|保留帽子/);
 const directTrace=(await pool.query('SELECT prompt,source_keys FROM design_versions WHERE id=$1',[editedResult.versionId])).rows[0];
 assert.equal(directTrace.source_keys.length,1);assert.ok(directTrace.source_keys[0].includes(v1.versionId));assert.equal(directTrace.prompt.uploadedReferenceSnapshot[0].role,'character');
 const nextDirectResponse=await reviseRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({taskId:task.id,baseVersionId:editedResult.versionId,instruction:'标题上移',mode:'direct',size:'1536x1152'})}));
 const nextDirect=await nextDirectResponse.json();assert.equal(nextDirectResponse.status,200);assert.equal(nextDirect.size,'1024x1536');assert.doesNotMatch(nextDirect.compiledPrompt,/卖点小一点/);assert.equal(nextDirect.rewriteContext.prompt,promptData.prompt);
 const nextResult=await generate(nextDirect);assert.ok((await pool.query('SELECT source_keys FROM design_versions WHERE id=$1',[nextResult.versionId])).rows[0].source_keys[0].includes(editedResult.versionId));
 for(const baseVersionId of [undefined,crypto.randomUUID()]){
  const invalid=await reviseRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({taskId:task.id,baseVersionId,instruction:'标题上移',mode:'direct'})}));assert.notEqual(invalid.status,200);
 }
 const rewriteResponse=await reviseRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({taskId:task.id,baseVersionId:nextResult.versionId,instruction:'重新安排整体构图',mode:'terra'})}));assert.equal(rewriteResponse.status,200,JSON.stringify(await rewriteResponse.json()));assert.equal(revisionInput.current.prompt,promptData.prompt);assert.deepEqual(revisionInput.previousImageEdits,['卖点小一点','标题上移']);
 const fullDraft={...direct,revisionMode:'terra',editInstruction:undefined,prompt:promptData.prompt+'必须使用上传IP作为清晰可见的封面主体。'};
 const ipGeneration=await generate(fullDraft);const ipRequest=imageRequests.at(-1);assert.equal(ipRequest.getAll('image').length,3);assert.equal(ipRequest.getAll('image')[2].name,'character.png');assert.match(ipRequest.get('prompt'),/图3：封面唯一IP身份来源/);assert.match(ipRequest.get('prompt'),/保留帽子/);
 const ipTrace=(await pool.query('SELECT prompt FROM design_versions WHERE id=$1',[ipGeneration.versionId])).rows[0].prompt;assert.equal(ipTrace.uploadedReferenceSnapshot[0].role,'character');
 const beforeRejected=imageRequests.length;
 await tasks.updateDesignTask(task.id,{status:'PROMPT_CONFIRMED',prompt:{...fullDraft,prompt:'不使用上传角色图，封面不出现人物',negativePrompt:'照片质感'}});
 const conflict=await generateRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({taskId:task.id})}));assert.match((await conflict.json()).error,/提示词存在冲突/);assert.equal(imageRequests.length,beforeRejected);
 const {buildReferencePlan}=await import('../visual-rules/generation.mjs');
 const examplePlan=buildReferencePlan((await tasks.taskContext(task.id)).reference_snapshot,{sellingType:'H'});
 await generate({...fullDraft,referencePlan:examplePlan});assert.equal(imageRequests.at(-1).getAll('image').at(-1).name,'selling-example-H.png');assert.match(imageRequests.at(-1).get('prompt'),/卖点H的单元结构样图/);
 await generate({...nextDirect,referencePlan:examplePlan});assert.equal(imageRequests.at(-1).getAll('image').length,1,'direct edits must not resend selling samples even when classification remains saved');
 // One-off edit references do not invalidate catalog/no-reference task state.
 const editUploadRoute=await jiti.import('../app/api/design-tasks/[id]/edit-references/route.ts');
 const beforeUpload=(await tasks.taskContext(task.id)).reference_revision;
 const editForm=new FormData();editForm.append('file',new File([image],'new-style.png',{type:'image/png'}));editForm.append('role','style');editForm.append('note','只参考边框，整体仍为蓝色');
 const editUpload=await editUploadRoute.POST(new Request('http://test',{method:'POST',body:editForm}),{params:Promise.resolve({id:task.id})});const editRef=await editUpload.json();assert.equal(editUpload.status,201,JSON.stringify(editRef));assert.equal((await tasks.taskContext(task.id)).reference_revision,beforeUpload);
 const editDraftResponse=await reviseRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({taskId:task.id,baseVersionId:v1.versionId,instruction:'整体改为蓝色调，边框参考图2',mode:'direct',editReferenceIds:[editRef.id]})}));const withEditRef=await editDraftResponse.json();assert.equal(editDraftResponse.status,200,JSON.stringify(withEditRef));
 const refResult=await generate(withEditRef);assert.equal(imageRequests.at(-1).getAll('image').length,2);assert.equal(imageRequests.at(-1).getAll('image')[1].name,'new-style.png');assert.match(imageRequests.at(-1).get('prompt'),/整体仍为蓝色/);assert.equal(imageRequests.at(-1).get('prompt'),withEditRef.compiledPrompt);
 const editTrace=(await pool.query('SELECT prompt,source_keys FROM design_versions WHERE id=$1',[refResult.versionId])).rows[0];assert.equal(editTrace.source_keys.length,2);assert.equal(editTrace.prompt.editReferenceSnapshot[0].id,editRef.id);
 const missingRef=await reviseRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({taskId:task.id,baseVersionId:v1.versionId,instruction:'修改',mode:'direct',editReferenceIds:[crypto.randomUUID()]})}));assert.notEqual(missingRef.status,200);
 const totalBefore=(await pool.query('SELECT count(*)::int n FROM design_versions WHERE task_id=$1',[task.id])).rows[0].n;
 const oldFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>String(url).endsWith('/images/edits')?Response.json({error:'test failure'},{status:502}):oldFetch(url,options);
 await tasks.updateDesignTask(task.id,{status:'PROMPT_CONFIRMED',prompt:withEditRef});const failedEdit=await generateRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({taskId:task.id,size:withEditRef.size})}));assert.equal(failedEdit.status,502);globalThis.fetch=oldFetch;
 assert.equal((await pool.query('SELECT count(*)::int n FROM design_versions WHERE task_id=$1',[task.id])).rows[0].n,totalBefore,'failed output must not create a history version');
 const legacyFailed=crypto.randomUUID();await pool.query("INSERT INTO design_versions(id,task_id,prompt,size,error_message) VALUES($1,$2,'{}','1024x1536','old failure')",[legacyFailed,task.id]);
 const taskRoute=await jiti.import('../app/api/design-tasks/[id]/route.ts');const history=await (await taskRoute.GET(new Request('http://test'),{params:Promise.resolve({id:task.id})})).json();assert.equal(history.versions.length,totalBefore);assert.ok(history.versions.every(v=>v.imageUrl));
 const noteRoute=await jiti.import('../app/api/design-tasks/references/[id]/route.ts');
 const noteResponse=await noteRoute.PATCH(new Request('http://test',{method:'PATCH',body:JSON.stringify({note:'用这个人做封面，保留摄影表现'})}),{params:Promise.resolve({id:uploaded[0].id})});assert.equal(noteResponse.status,200);
 assert.equal((await pool.query('SELECT note FROM design_task_references WHERE id=$1',[uploaded[0].id])).rows[0].note,'用这个人做封面，保留摄影表现');
 assert.equal((await pool.query('SELECT prompt FROM design_tasks WHERE id=$1',[task.id])).rows[0].prompt,null);
 const deleteReference=await jiti.import('../app/api/design-tasks/references/[id]/route.ts');assert.equal((await deleteReference.DELETE(new Request('http://test',{method:'DELETE'}),{params:Promise.resolve({id:uploaded[0].id})})).status,200);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM design_task_references WHERE task_id=$1',[task.id])).rows[0].n,0);
 // Independent references share the real report/prompt/generation routes, but
 // never create catalog assets. Old reference results cannot overwrite edits.
 const createRoute=await jiti.import('../app/api/design-tasks/route.ts');
 const uploadTaskResponse=await createRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({draftId:first.draftId,revision:1,referenceSource:'upload',referenceAssetIds:[],textModel:'gpt-5.6-terra'})}));
 const uploadTask=await uploadTaskResponse.json();assert.equal(uploadTaskResponse.status,201,JSON.stringify(uploadTask));
 await assert.rejects(()=>tasks.taskContext(uploadTask.id),/尚未确认/);
 await assert.rejects(()=>tasks.confirmUploadedReferences(uploadTask.id),/至少一张/);
 const uploadForm=new FormData();uploadForm.append('files',new File([image],'layout.png',{type:'image/png'}));uploadForm.append('role','layout');
 const uploadedResult=await uploadRoute.POST(new Request('http://test',{method:'POST',body:uploadForm}),{params:Promise.resolve({id:uploadTask.id})});
 const uploadedRefs=await uploadedResult.json();assert.equal(uploadedResult.status,201,JSON.stringify(uploadedRefs));
 await tasks.confirmUploadedReferences(uploadTask.id);await tasks.confirmUploadedReferences(uploadTask.id);
 assert.equal(visionModels.at(-1),'gpt-5.6-terra','upload vision must use the task selection, not the original brief model');
 assert.equal((await tasks.taskContext(uploadTask.id)).reference_snapshot.length,0);
 const directReportResponse=await reportRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({taskId:uploadTask.id})}));
 const directReport=await directReportResponse.json();assert.equal(directReportResponse.status,200,JSON.stringify(directReport));assert.equal(directReport.referenceRevision,1);
 await tasks.updateDesignTask(uploadTask.id,{report:directReport,status:'REPORT_READY'});
 const promptRoute=await jiti.import('../app/api/brief/prompt/route.ts');
 const directPromptResponse=await promptRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({taskId:uploadTask.id})}));
 const directPrompt=await directPromptResponse.json();assert.equal(directPromptResponse.status,200,JSON.stringify(directPrompt));assert.equal(directPrompt.referenceRevision,1);
 await tasks.updateDesignTask(uploadTask.id,{prompt:directPrompt,status:'PROMPT_DRAFT'});
 await tasks.updateDesignTask(uploadTask.id,{prompt:directPrompt,status:'PROMPT_CONFIRMED'});
 const directGeneration=await generateRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({taskId:uploadTask.id})}));
 const directGenerated=await directGeneration.json();assert.equal(directGeneration.status,200,JSON.stringify(directGenerated));assert.equal(imageRequests.at(-1).getAll('image').length,1);assert.equal(imageRequests.at(-1).getAll('image')[0].name,'layout.png');
 await noteRoute.PATCH(new Request('http://test',{method:'PATCH',body:JSON.stringify({note:'保留分栏'})}),{params:Promise.resolve({id:uploadedRefs[0].id})});
 await assert.rejects(()=>tasks.taskContext(uploadTask.id),/尚未确认/);
 await tasks.confirmUploadedReferences(uploadTask.id);
 await assert.rejects(()=>tasks.updateDesignTask(uploadTask.id,{report:directReport,status:'REPORT_READY'}),/版本已变化/);
 const refsModule=await jiti.import('../lib/task-references.ts');
 await assert.rejects(()=>refsModule.assertReferenceRevision(uploadTask.id,1),/已修改/);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM design_versions WHERE task_id=$1',[uploadTask.id])).rows[0].n,1,'reference edits preserve generated history');
 const corrupt=new FormData();corrupt.append('files',new File(['not an image'],'broken.png',{type:'image/png'}));
 const corruptResult=await uploadRoute.POST(new Request('http://test',{method:'POST',body:corrupt}),{params:Promise.resolve({id:uploadTask.id})});assert.notEqual(corruptResult.status,201);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM design_task_references WHERE task_id=$1',[uploadTask.id])).rows[0].n,1);
 await noteRoute.PATCH(new Request('http://test',{method:'PATCH',body:JSON.stringify({note:'开始并发测试'})}),{params:Promise.resolve({id:uploadedRefs[0].id})});
 const mockedFetch=globalThis.fetch;let changedDuringAnalysis=false;
 try{globalThis.fetch=async(input,options)=>{
   if(String(input).endsWith('/responses')&&!changedDuringAnalysis){changedDuringAnalysis=true;await noteRoute.PATCH(new Request('http://test',{method:'PATCH',body:JSON.stringify({note:'识别中又修改说明'})}),{params:Promise.resolve({id:uploadedRefs[0].id})});}
   return mockedFetch(input,options);
  };
  await assert.rejects(()=>tasks.confirmUploadedReferences(uploadTask.id),/已变化|已修改/);
  assert.equal((await pool.query('SELECT status FROM design_tasks WHERE id=$1',[uploadTask.id])).rows[0].status,'REFERENCE_PENDING');
 }finally{globalThis.fetch=mockedFetch;}
 // A legacy final-cover specification must not reject a character-only upload.
 const legacyRule={field:'title',operator:'include',value:'ROUNDED_OUTLINE',evidence:'标题采用圆润粗体'};
 const legacy=await briefs.analyseDraft({brief:'小学数学礼盒，标题采用圆润粗体'});
 await pool.query("UPDATE brief_revisions SET analysis=jsonb_set(analysis,'{hardConstraints}',$2::jsonb) WHERE draft_id=$1",[legacy.draftId,JSON.stringify([legacyRule])]);
 await briefs.confirmBrief(legacy.draftId,1);
 const legacyTask=await tasks.createDesignTask({draftId:legacy.draftId,revision:1,referenceSource:'upload',referenceAssetIds:[]});
 const ipOnly=new FormData();ipOnly.append('files',new File([image],'ip-only.png',{type:'image/png'}));ipOnly.append('role','character');
 assert.equal((await uploadRoute.POST(new Request('http://test',{method:'POST',body:ipOnly}),{params:Promise.resolve({id:legacyTask.id})})).status,201);
 await tasks.confirmUploadedReferences(legacyTask.id);assert.equal((await tasks.taskContext(legacyTask.id)).analysis.hardConstraints.length,0);
 const broad=await retrieval.retrieveVectorCandidateSuites({...first,grade:'小学'});assert.equal(broad.length,1,'primary grades include specific elementary grades');
 // No-reference creation traverses real routes to image generation, without an
 // upload, fake source, or paid network call. Example-only edits are optional.
 const noneResponse=await createRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({draftId:legacy.draftId,revision:1,referenceSource:'none',referenceAssetIds:[],textModel:'gpt-5.6-luna'})}));
 const none=await noneResponse.json();assert.equal(noneResponse.status,201,JSON.stringify(none));
 const noneReport=await (await reportRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({taskId:none.id})}))).json();
 await tasks.updateDesignTask(none.id,{report:noneReport,status:'REPORT_READY'});
 const nonePromptResponse=await promptRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({taskId:none.id,creativity:'exploratory'})}));
 const nonePrompt=await nonePromptResponse.json();assert.equal(nonePromptResponse.status,200,JSON.stringify(nonePrompt));assert.equal(nonePrompt.referencePlan.sellingSourceId,'');
 await tasks.updateDesignTask(none.id,{prompt:nonePrompt,status:'PROMPT_DRAFT'});await tasks.updateDesignTask(none.id,{prompt:nonePrompt,status:'PROMPT_CONFIRMED'});
 const noneGenerated=await generateRoute.POST(new Request('http://test',{method:'POST',body:JSON.stringify({taskId:none.id})}));
 const noneResult=await noneGenerated.json();assert.equal(noneGenerated.status,200,JSON.stringify(noneResult));assert.equal(noneResult.usedImageReferences,0);
 assert.match(imageRequests.at(-1).prompt,/标题采用圆润粗体/);assert.doesNotMatch(imageRequests.at(-1).prompt,/图1：/);
 const downloadRoute=await jiti.import('../app/api/generated/versions/[id]/route.ts');
 const downloaded=await downloadRoute.GET(new Request('http://test/?download=1'),{params:Promise.resolve({id:noneResult.versionId})});
 assert.match(downloaded.headers.get('content-disposition'),/attachment/);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),image);
 assert.equal((await downloadRoute.GET(new Request('http://test'),{params:Promise.resolve({id:'invalid'})})).status,404);
 const second=await briefs.analyseDraft({draftId:first.draftId,revision:1,supplement:'改为插画，不要真人'});assert.equal(second.revision,2);await assert.rejects(()=>briefs.getConfirmedBrief(first.draftId,1));await assert.rejects(()=>tasks.taskContext(task.id));await briefs.confirmBrief(first.draftId,2);
 candidates=await retrieval.retrieveVectorCandidateSuites(second);assert.equal(candidates.length,1);assert.equal(candidates[0].helpers.length,2,'output-only exclusion does not disqualify reference images');
 assert.equal(second.hardConstraints.length,0);assert.equal(second.generationConstraints[0].value,'真人肖像');
 await pool.query("UPDATE assets SET review_state='PENDING' WHERE id=$1",[assets[0]]);assert.equal((await retrieval.retrieveVectorCandidateSuites(second)).length,0);await embedVisual(pool,async()=>image,async()=>vector,rev.id);assert.equal((await archive.listVisualRevisions())[0].status,'WAITING_ELIGIBILITY');
 await pool.query("UPDATE assets SET review_state='CONFIRMED',target_visual_revision_id=NULL WHERE id=$1",[assets[0]]);await embedVisual(pool,async()=>image,async()=>{throw new Error('stale revision ran');},rev.id);
 const malformed=await jiti.import('../app/api/retrieve/route.ts');assert.equal((await malformed.POST(new Request('http://test',{method:'POST',body:'{'}))).status,400);
 // Unified review is atomic: a stale visual revision cannot partially confirm
 // the basic metadata, nor can a candidate be published without human input.
 const unified=await jiti.import('../lib/unified-review.ts');
 const reviewIds=[];
 for(let index=0;index<2;index++){
  const id=(await pool.query("INSERT INTO assets(checksum,filename,display_name,source_key,preview_key,mime_type,suite_id,material_type,review_state) VALUES($1,$2,$2,'source','preview.jpg','image/png',$3,'BOOK_COVER','PENDING') RETURNING id",['unified-'+index,'统一审核'+index+'.png',suite])).rows[0].id;
  await archive.queueVisualUpgrade([id]);const r=(await archive.listVisualRevisions()).find(row=>row.asset_id===id);await analyseVisual(pool,async()=>image,async()=>profile,r.id);reviewIds.push({id,revisionId:r.id});
 }
 const fields={displayName:'人工名称',projectName:'隔离测试项目',suiteName:'测试套系',materialType:'BOOK_COVER',colors:[],tags:[],coreElements:[],isPrimary:false};
 const items=reviewIds.map(row=>({assetId:row.id,revisionId:row.revisionId,profile,fields}));
 await assert.rejects(()=>unified.confirmReview([items[0],{...items[1],revisionId:crypto.randomUUID()}]),/变化/);
 assert.ok((await pool.query('SELECT review_state FROM assets WHERE id=ANY($1::uuid[])',[reviewIds.map(row=>row.id)])).rows.every(row=>row.review_state==='PENDING'));
 await unified.confirmReview(items);
 assert.ok((await pool.query('SELECT review_state,display_name FROM assets WHERE id=ANY($1::uuid[])',[reviewIds.map(row=>row.id)])).rows.every(row=>row.review_state==='CONFIRMED'&&row.display_name==='人工名称'));
 assert.ok((await pool.query('SELECT status FROM visual_revisions WHERE id=ANY($1::uuid[])',[reviewIds.map(row=>row.revisionId)])).rows.every(row=>row.status==='APPROVED'));
 assert.equal((await pool.query('SELECT primary_asset_id FROM visual_suites WHERE id=$1',[suite])).rows[0].primary_asset_id,assets[0]);
 // Reopened metadata + already approved visual snapshot must remain confirmable.
 await pool.query("UPDATE assets SET review_state='PENDING' WHERE id=$1",[reviewIds[0].id]);
 await pool.query("UPDATE visual_revisions SET status='WAITING_ELIGIBILITY' WHERE id=$1",[reviewIds[0].revisionId]);
 await pool.query("UPDATE jobs SET status='COMPLETED' WHERE dedupe_key=$1",['EMBED_VISUAL:'+reviewIds[0].revisionId]);
 await assert.rejects(()=>unified.confirmReview([{...items[0],revisionId:crypto.randomUUID()}]),/变化/);
 await unified.confirmReview([{...items[0],profile:emptyProfile()}]);
 assert.equal((await pool.query('SELECT review_state FROM assets WHERE id=$1',[reviewIds[0].id])).rows[0].review_state,'CONFIRMED');
 const retainedVisual=(await pool.query('SELECT status,confirmed FROM visual_revisions WHERE id=$1',[reviewIds[0].revisionId])).rows[0];
 assert.equal(retainedVisual.status,'APPROVED');assert.deepEqual(retainedVisual.confirmed,profile,'metadata reconfirmation does not replace reviewed visual data with stale candidate');
 assert.equal((await pool.query('SELECT status FROM jobs WHERE dedupe_key=$1',['EMBED_VISUAL:'+reviewIds[0].revisionId])).rows[0].status,'QUEUED');
 await assert.rejects(()=>unified.chooseSuitePrimary(waitingSuite,reviewIds[0].id),/该套系/);
 await pool.query('SET enable_seqscan=off');const explain=(await pool.query('EXPLAIN SELECT asset_id FROM asset_embeddings ORDER BY text_embedding <=> $1::vector LIMIT 10',[literal])).rows.map(row=>row['QUERY PLAN']).join('\n');assert.match(explain,/embeddings_text_hnsw/);
 // Review regressions: a curated upload needs no reuse choice or adaptation notes.
 const assetApi=await jiti.import('../lib/archive.ts');
 const reviewRoute=await jiti.import('../app/api/assets/[id]/review/route.ts');
 const inserted=(await pool.query("INSERT INTO assets(checksum,filename,display_name,source_key,preview_key,mime_type,suite_id,material_type,reuse_state) VALUES('review-test','扉页4.png','扉页4.png','source','preview.jpg','image/png',$1,'BOOK_COVER','ADAPT_REQUIRED') RETURNING id",[suite])).rows[0];
 await pool.query("DELETE FROM schema_migrations WHERE name='03-filename-review-defaults'");await migrate(pool);
 assert.equal((await assetApi.getAsset(inserted.id)).materialType,'TITLE_PAGE');
 const reviewBody={projectName:'隔离测试项目',suiteName:'测试套系',displayName:'我的扉页',materialType:'OTHER',colors:[],tags:[],coreElements:[],isPrimary:false};
 const response=await reviewRoute.PATCH(new Request('http://test',{method:'PATCH',body:JSON.stringify(reviewBody)}),{params:Promise.resolve({id:inserted.id})});
 assert.equal(response.status,200);const saved=await response.json();assert.equal(saved.reuseState,'REUSABLE');assert.equal(saved.embeddingStatus,'WAITING_VISUAL');assert.match(saved.reviewMessage,/视觉规则审核/);
 assert.equal((await pool.query('SELECT * FROM asset_embeddings WHERE asset_id=$1',[inserted.id])).rowCount,0);
 await assetApi.reopenAssetForReview(inserted.id);
 await pool.query("DELETE FROM schema_migrations WHERE name='03-filename-review-defaults'");await migrate(pool);
 assert.equal((await assetApi.getAsset(inserted.id)).materialType,'OTHER');assert.equal((await assetApi.getAsset(inserted.id)).displayName,'我的扉页');
 await archive.queueVisualUpgrade([inserted.id]);const candidate=(await archive.listVisualRevisions()).find(row=>row.asset_id===inserted.id);
 await analyseVisual(pool,async()=>image,async()=>profile,candidate.id);
 await pool.query("UPDATE assets SET reuse_state='ADAPT_REQUIRED' WHERE id=$1",[inserted.id]);
 await archive.confirmVisualRevisions([{id:candidate.id,profile}]);
 assert.equal((await pool.query('SELECT confirmed FROM visual_revisions WHERE id=$1',[candidate.id])).rows[0].confirmed.title.types[0],'ROUNDED_OUTLINE');
 await pool.query('UPDATE assets SET preview_key=NULL WHERE id=$1',[inserted.id]);
 const missingPreview=await reviewRoute.PATCH(new Request('http://test',{method:'PATCH',body:JSON.stringify(reviewBody)}),{params:Promise.resolve({id:inserted.id})});assert.equal(missingPreview.status,400);
 console.log('PASS: migrations, 303-asset filtered retrieval, pending isolation, failure preservation, atomic publication, optional legacy notes, brief revisions, server snapshots, stale jobs, revoked eligibility, JSON errors, HNSW plan, filename repair, review API, preserved manual overrides, preview eligibility');
}finally{
 globalThis.fetch=originalFetch;if(appDb)await appDb.database().end();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();
}
