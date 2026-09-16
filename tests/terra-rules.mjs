import assert from 'node:assert/strict';
import {createJiti} from 'jiti';
import {GENERATION_RULE_VERSION} from '../visual-rules/generation.mjs';
const jiti=createJiti(import.meta.url,{alias:{'@':process.cwd()}});
process.env.AI_GATEWAY_BASE_URL='http://models.mock/v1';process.env.AI_GATEWAY_API_KEY='mock-only';
const {analyseBrief,createReferenceReport,composeImagePrompt}=await jiti.import('../lib/gateway.ts');
const original=globalThis.fetch;let responses=[],requests=[];
globalThis.fetch=async(url,options)=>{assert.match(String(url),/chat\/completions$/);requests.push(JSON.parse(options.body));assert.ok(responses.length);return Response.json({choices:[{message:{content:JSON.stringify(responses.shift())}}]});};
try {
 const brief={materialType:'礼盒',grade:'未指定',subject:'英语',productLine:'教辅礼盒',audience:'英语学习者',intent:'学习',usageScenario:'家庭学习',productValue:'英语提升',emotionalValue:'成就',designDirection:'正式明快的英语学习礼盒',designKeywords:['三十天数字主视觉','正式','成就'],styleKeywords:[],colorKeywords:[],mustAvoid:[],assumptions:[],preferences:{title:[],selling:[],subject:[]},hardConstraints:[],unsupportedConstraints:[],searchQuery:'英语礼盒'};
 responses=[brief,{designKeywords:['正式','活力','成就']}];const analysis=await analyseBrief('三十天英语礼盒');assert.deepEqual(analysis.designKeywords,['正式','活力','成就']);assert.equal(requests.length,2);
 const report={summary:'蓝白礼盒，以大标题建立学习目标。',reasons:['标题关系清晰'],reusableElements:['四组卖点统一对齐'],riskNotes:['替换旧品牌']};
 responses=[{...report,summary:'很长'.repeat(100)},report];requests=[];
 const input={analysis,primaryDescription:'参考标题和卖点分区',helperDescriptions:[]};const result=await createReferenceReport(input);assert.equal(result.summary,report.summary);assert.equal(requests.length,2);assert.equal(JSON.parse(requests[1].messages[1].content).input.analysis.originalBrief,'三十天英语礼盒');
 responses=[{prompt:'设计英语提升礼盒封面，采用蓝白底色与清晰四栏卖点。',negativePrompt:'错误文字、旧品牌'}];requests=[];
 const prompt=await composeImagePrompt({...input,analysis:{...analysis,colorKeywords:['蓝色','橙色']},report:result,size:'1536x1152'});assert.equal(prompt.generationRuleVersion,GENERATION_RULE_VERSION);assert.match(requests[0].messages[0].content,/礼盒封面平面设计稿/);const composedInput=JSON.parse(requests[0].messages[1].content);assert.equal(composedInput.size,'1536x1152');assert.deepEqual(composedInput.analysis.colorKeywords,[]);assert.equal(composedInput.analysis.originalBrief,analysis.originalBrief);assert.match(composedInput.palettePolicy,/不预置/);assert.match(composedInput.coverHierarchy,/8–15%/);
 responses=[{prompt:'蓝色调英语礼盒',negativePrompt:'错误文字'}];requests=[];
 const blue=await composeImagePrompt({...input,analysis:{...analysis,originalBrief:'英语礼盒，整体蓝色调',supplements:['用浅蓝色']},report:result,referenceRoles:['图1：红色整体参考；配色基准']});
 assert.match(JSON.parse(requests[0].messages[1].content).palettePolicy,/用户颜色要求优先于全部参考/);assert.match(blue.compiledPrompt,/整体蓝色调/);assert.match(blue.compiledPrompt,/用浅蓝色/);assert.doesNotMatch(blue.compiledPrompt,/配色基准/);
 responses=[{prompt:'过长'.repeat(1100),negativePrompt:'无'}, {prompt:'【文案】四条卖点，逐字采用本次需求。【卖点结构】底部四等分月桂，保留单元结构。',negativePrompt:'不增加卡片'}];requests=[];
 const shortened=await composeImagePrompt({...input,report:result,size:'1536x1152'});assert.equal(requests.length,2);assert.ok(shortened.prompt.includes('四条卖点'));assert.ok(JSON.parse(requests[1].messages[1].content).analysis.originalBrief.includes('三十天'));
 console.log('PASS Luna style-word repair, Terra concise report retry without truncation, fixed image2 prompt/version, original requirement preservation; no paid calls');
 const bad={prompt:'不使用上传角色图，封面不出现人物。',negativePrompt:'角色人物、照片质感'};
 const good={prompt:'使用上传IP作为清晰可见的封面人物主体，保留照片表现；标题与四组卖点保持层级。',negativePrompt:'错误文字、多余人物'};
 responses=[bad,good];requests=[];
 const repaired=await composeImagePrompt({...input,report:result,uploadedReferences:[{role:'character',instruction:'封面人物必须可见'}]});assert.equal(repaired.prompt,good.prompt);assert.equal(requests.length,2);assert.ok(JSON.parse(requests[1].messages[1].content).conflicts.length);
 responses=[bad,bad];requests=[];await assert.rejects(()=>composeImagePrompt({...input,report:result,uploadedReferences:[{role:'character',instruction:'封面人物必须可见'}]}),/提示词存在冲突/);assert.equal(requests.length,2);
}finally{globalThis.fetch=original;}
