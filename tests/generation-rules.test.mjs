import assert from 'node:assert/strict';
import test from 'node:test';
import {canvasSizes,normalizeImageSize,validReport,assembleImage2Prompt,buildReferencePlan,promptLength,generationPromptBudget} from '../visual-rules/generation.mjs';
import {validStyleKeywords} from '../visual-rules/v1/index.mjs';
import {buildReferenceRoles} from '../visual-rules/reference-roles.mjs';
test('direct edits use only current instructions, not full design policies or old negative prompts',()=>{
 const input={draft:{revisionMode:'direct',editInstruction:'卖点缩小，人物不变',prompt:'旧正文'.repeat(1000),negativePrompt:'不要人物',creativity:'exploratory',referencePlan:{sellingInstruction:'采用H结构'}},analysis:{designDirection:'旧方向',hardConstraints:[],mustAvoid:['真人']},size:'1024x1536',referenceRoles:['图2：其他IP'],referenceNotes:['换成蓝色']};
 const prompt=assembleImage2Prompt(input);
 assert.match(prompt,/卖点缩小，人物不变/);assert.match(prompt,/其余文案、人物身份、配色、构图和细节沿用底图/);
 assert.doesNotMatch(prompt,/旧正文|不要人物|采用H|其他IP|蓝色|旧方向|大胆探索/);assert.ok(promptLength(prompt)<200);
 assert.throws(()=>assembleImage2Prompt({...input,draft:{...input.draft,editInstruction:' '}}),/修改意见/);
});
test('actual full prompt accepts 2000 characters including Unicode and roles, no arbitrary reserve',()=>{
 const analysis={designDirection:'明快',hardConstraints:[],mustAvoid:[]};
 const references=[{id:'main',profile:null}],uploads=[{id:'ip',role:'character',note:'真人出镜'}];
 const plan=buildReferencePlan(references,{sellingType:'F',creativity:'exploratory'});
 const referenceRoles=buildReferenceRoles({references,uploads,baseKind:'edit',referencePlan:plan,creativity:'exploratory'});
 const input={analysis,size:'1024x1536',referencePlan:plan,referenceRoles,creativity:'exploratory'};
 const budget=generationPromptBudget(input);
 const draft={prompt:'字'.repeat(budget-2)+'😀',negativePrompt:'错',referencePlan:plan,creativity:'exploratory'};
 const result=assembleImage2Prompt({...input,draft});assert.equal(promptLength(result),2000);
 assert.match(result,/真人出镜/);assert.match(result,/图4：卖点F/);assert.match(result,/大胆探索/);
 assert.throws(()=>assembleImage2Prompt({...input,draft:{...draft,prompt:draft.prompt+'字'}}),/超过2000/);
 assert.match(buildReferencePlan(references,{creativity:'exploratory'}).sellingInstruction,/可重新设计/);
 assert.match(buildReferencePlan(references,{creativity:'balanced'}).sellingInstruction,/单元形态/);
 assert.match(plan.sellingInstruction,/采用F/);assert.doesNotMatch(plan.sellingInstruction,/可重新设计/);
});
test('all selectable sizes satisfy image2, legacy ratios are corrected exactly',()=>{
 for(const {value} of canvasSizes){const [w,h]=value.split('x').map(Number);assert.equal(w%16,0);assert.equal(h%16,0);}
 assert.equal(normalizeImageSize('1365x1024'),'1536x1152');assert.equal(normalizeImageSize('1024x1365'),'1152x1536');
 assert.throws(()=>normalizeImageSize('1301x999'));assert.throws(()=>normalizeImageSize(null));
});
test('selling inheritance uses chosen image, preserves local bans and ignores old course numbers as counts',()=>{
 const refs=[{id:'primary',profile:{selling:{status:'OBSERVED',count:'5,10,1600,14',unit:'开放月桂',position:'底部',alignment:'居中',separator:'留白'}}},{id:'helper',profile:null}];
 const inherited=buildReferencePlan(refs);assert.match(inherited.sellingInstruction,/开放月桂/);assert.ok(!inherited.sellingInstruction.includes('1600'));
 const custom=buildReferencePlan(refs,{sellingSourceId:'helper',sellingType:'H'});assert.match(custom.sellingInstruction,/不加图标、卡片、胶囊/);assert.equal(custom.sellingSourceId,'helper');
 assert.throws(()=>buildReferencePlan(refs,{sellingSourceId:'foreign'}));
 const analysis={designDirection:'方向',hardConstraints:[],mustAvoid:[]};const draft={prompt:'【文案】主标题：数学；卖点：5天直播；14天伴学。',negativePrompt:'不增加文案',referencePlan:custom};
 const final=assembleImage2Prompt({draft,analysis,size:'1024x1536',referenceRoles:['图1：主参考','图2：卖点来源']});
 assert.ok(promptLength(final)<=2000);assert.match(final,/图2：卖点来源/);assert.match(final,/组件数等于本次文案条数/);
 assert.throws(()=>assembleImage2Prompt({draft:{...draft,prompt:'字'.repeat(2001)},analysis,size:'1024x1536'}),/超过2000/);
 assert.ok(generationPromptBudget({analysis,size:'1024x1536',referencePlan:custom})<2000);
});
test('style words must be 3-4 distinct Chinese words of 2-4 characters',()=>{
 assert.equal(validStyleKeywords(['童趣','正式','成就']),true);assert.equal(validStyleKeywords(['未来感','温暖','活力','秩序感']),true);
 for(const keywords of [['三十天数字主视觉','正式','成就'],['童趣','童趣','成就'],['好','正式','成就'],['Formal','正式','成就']])assert.equal(validStyleKeywords(keywords),false);
});
test('report enforces concise complete statements; final prompt keeps user constraints',()=>{
 const report={summary:'正式明快的学习礼盒',reasons:['标题清晰'],reusableElements:['大标题配合四组卖点'],riskNotes:[]};assert.equal(validReport(report),true);assert.equal(validReport({...report,reasons:['长'.repeat(51)]}),false);
 const prompt=assembleImage2Prompt({draft:{prompt:'标题：三十天英语提升计划。四栏卖点。',negativePrompt:'文字错误'},analysis:{designDirection:'正式明快',hardConstraints:[{operator:'exclude',value:'真人肖像'}],mustAvoid:['不要渐变']},size:'1365x1024'});
 assert.match(prompt,/1536x1152/);assert.match(prompt,/不使用真人肖像/);assert.match(prompt,/不要渐变/);assert.match(prompt,/三十天英语提升计划/);assert.ok(!prompt.includes('1365x1024'));
});
