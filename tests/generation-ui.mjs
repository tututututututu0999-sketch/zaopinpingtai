import {sharedUiRoute} from './ui-model-fixtures.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}});
const preview=await readFile(new URL('../数学思维冲顶计划/主书封面1.png',import.meta.url));
const asset={id:'asset',filename:'礼盒封面.png',displayName:'礼盒封面.png',projectId:'project',projectName:'测试项目',suiteId:'suite',suiteName:'测试套系',materialType:'GIFT_BOX',colors:[],tags:[],coreElements:[],reviewState:'CONFIRMED',reuseState:'REUSABLE',embeddingStatus:'READY',analysisStatus:'ANALYZED',isPrimary:true,previewUrl:'/api/assets/asset/preview'};
const brief={draftId:'draft',revision:1,ruleVersion:'v1',originalBrief:'三十天英语提升计划',source:'luna',materialType:'礼盒',grade:'未指定',subject:'英语',audience:'英语学习者',usageScenario:'家庭学习',productValue:'英语提升',emotionalValue:'成就',designDirection:'以三十天为主标题，配合清晰卖点信息，呈现正式而充满行动感的英语提升礼盒。',designKeywords:['正式','成就','活力'],assumptions:[],preferences:{title:[],selling:[],subject:[]},hardConstraints:[],unsupportedConstraints:[],mustAvoid:[],searchQuery:'英语礼盒'};
const report={source:'terra',summary:'以蓝白配色和有序标题建立学习计划识别，突出三十天目标与课程权益。',reasons:['同类礼盒的标题层级清晰','辅助图提供规整的卖点结构'],reusableElements:['借鉴大标题与留白关系','四组卖点统一对齐','使用蓝白底色与黄色重点'],riskNotes:['替换旧标题、品牌与课程数字']};
const prompt={source:'terra',generationRuleVersion:'image2-v1',prompt:'设计一张三十天英语提升计划礼盒封面平面稿。正式、活力、成就感，以蓝白为主色，黄色强调主标题。主体为大字三十天，下方按四组信息单元排布课程权益，形成清晰的阅读层级。只采用用户提供的本次文案，延续参考图的标题关系而不复制旧内容。',negativePrompt:'文字错误、旧品牌、拥挤排版'};
try {for(const width of [1440,390]) {
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:width===390?'reduce':'no-preference'});const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));let calls=0,release,started;let gate=new Promise(resolve=>{started=resolve;});let promptCalls=0,saveCalls=0,releasePrompt,startPrompt,confirmedVersion;const promptGate=new Promise(resolve=>{startPrompt=resolve;});
 await page.route('**/api/**',async route=>{if(await sharedUiRoute(route))return;
  const req=route.request(),path=new URL(req.url()).pathname;let data;
  if(path.endsWith('/preview')||path.startsWith('/api/generated/'))return route.fulfill({contentType:'image/png',body:preview});
  if(path==='/api/assets')data=[asset];else if(path==='/api/projects'||path==='/api/imports'||path==='/api/visual-revisions')data=[];
  else if(path==='/api/brief/analyse'||path==='/api/brief/confirm')data=brief;
  else if(path==='/api/retrieve')data={candidates:[{suiteId:'suite',suiteName:'测试套系',projectName:'测试项目',score:70,primary:asset,helpers:[],matchReasons:['标题关系匹配']} ]};
  else if(path==='/api/design-tasks')data={id:'task',status:'REFERENCE_CONFIRMED'};
  else if(path==='/api/design-tasks/task'){
   if(req.method()==='PATCH'&&req.postDataJSON().status==='PROMPT_DRAFT'&&++saveCalls===1)return route.fulfill({status:502,json:{error:'保存连接中断'}});
   if(req.method()==='PATCH'&&req.postDataJSON().action==='confirm-reference')confirmedVersion=req.postDataJSON().versionId;
   data=req.method()==='GET'?{versions:[{id:'v2',imageUrl:'/api/generated/versions/v2',prompt,size:'1536x1152'},{id:'v1',imageUrl:'/api/generated/versions/v1',prompt:{...prompt,prompt:'历史版本一的提示词'},size:'1024x1536'}]}:{id:'task',status:req.postDataJSON().status};
  }
  else if(path==='/api/brief/report')data=report;
  else if(path==='/api/design-tasks/task/references'){
   assert.equal(req.method(),'POST');assert.ok(req.postData().includes('character'));data=[{id:'ip',role:'character',note:'保留帽子',filename:'ip.png',url:'/api/generated/ip'}];
  }
  else if(path==='/api/design-tasks/references/ip'){
   assert.equal(req.method(),'PATCH');data={note:req.postDataJSON().note};
  }
  else if(path==='/api/design-tasks/task/edit-references'){
   if(req.method()==='GET')return route.fulfill({contentType:'image/png',body:preview});
   assert.ok(req.postData().includes('只借鉴边框'));data={id:'edit-ref',filename:'edit-style.png',role:'style',note:'只借鉴边框',url:'/api/design-tasks/task/edit-references?ref=edit-ref'};
  }
  else if(path==='/api/brief/prompt/revise'){
   if(req.postDataJSON().mode==='direct'){assert.equal(req.postDataJSON().baseVersionId,'v1');assert.deepEqual(req.postDataJSON().editReferenceIds,['edit-ref']);data={...prompt,prompt:'卖点小一点',editInstruction:'卖点小一点',editReferenceIds:['edit-ref'],referenceRoles:['图1：所选改图底图','图2：本次风格参考；只借鉴边框'],negativePrompt:'',size:'1024x1536',editBaseVersionId:'v1',revisionMode:'direct'};}
   else{assert.equal(req.postDataJSON().mode,'terra');assert.equal(req.postDataJSON().baseVersionId,'v2');data={...prompt,prompt:'重新组织标题与卖点布局',size:'1024x1536',editBaseVersionId:'v2',revisionMode:'terra'};}
  }
  else if(path==='/api/brief/prompt'){
   assert.equal(req.postDataJSON().creativity,'exploratory');
   assert.equal(req.postDataJSON().size,'1536x1152');
   promptCalls++;assert.equal(req.postDataJSON().sellingType,'H');assert.equal(req.postDataJSON().sellingSourceId,'asset');if(promptCalls===1){await new Promise(resolve=>{releasePrompt=resolve;startPrompt();});return route.fulfill({status:502,json:{error:'AI 网关没有返回内容'}});}data={...prompt,referencePlan:{sellingSourceId:'asset',sellingType:'H',sellingInstruction:'上下细线夹住每条信息，不添加图标或卡片'}};
  }
  else if(path==='/api/images/generate'){
   calls++;assert.equal(req.postDataJSON().size,calls>2?'1024x1536':'1536x1152');await new Promise(resolve=>{release=resolve;started();});
   if(calls===1||calls===3)return route.fulfill({status:502,json:{error:'测试网关失败，可重试'}});
   data={imageUrl:'/api/generated/versions/v2',versionId:'v2',size:calls>2?'1024x1536':'1536x1152',usedImageReferences:1};
  }else throw new Error(`Unexpected request ${path}`);
  return route.fulfill({json:data});
 });
 await page.goto(process.env.APP_URL||'http://localhost:3000');await page.getByRole('button',{name:'分析设计需求',exact:true}).click();await page.getByRole('heading',{name:'风格关键词'}).waitFor();
 for(const word of brief.designKeywords)assert.ok((await page.locator('.direction-keywords').textContent()).includes(word));
 await page.locator('.direction-review').screenshot({path:`/private/tmp/direction-review-${width}.png`});
 const widths=await page.locator('.direction-keywords li').evaluateAll(items=>items.map(item=>item.getBoundingClientRect().width));assert.ok(Math.max(...widths)-Math.min(...widths)<1);
 await page.getByRole('button',{name:'确认方向并检索',exact:true}).click();await page.getByRole('button',{name:'确认参考并生成报告',exact:true}).click();await page.locator('.generation-report-details>summary').click();await page.getByRole('heading',{name:'本次采用'}).waitFor();
 await page.getByLabel('卖点结构',{exact:true}).selectOption('H');
 await page.getByRole('button',{name:/大胆探索/}).click();assert.equal(await page.getByLabel('卖点结构',{exact:true}).inputValue(),'H','explicit selling classification stays locked at high freedom');
 assert.match(await page.locator('.effective-policy').textContent(),/大胆探索 · 卖点锁定 H/);
 await page.getByRole('button',{name:'解除分类锁定',exact:true}).click();assert.equal(await page.getByLabel('卖点结构',{exact:true}).inputValue(),'');assert.match(await page.locator('.effective-policy').textContent(),/卖点由 AI 设计/);
 await page.getByLabel('卖点结构',{exact:true}).selectOption('H');
 await page.getByRole('button',{name:/横版 4:3/}).click();
 assert.equal(await page.locator('.prompt-card').count(),0);
 await page.getByLabel('上传用途',{exact:true}).selectOption('character');
 await page.locator('input[type=file][accept="image/png,image/jpeg,image/webp"]').setInputFiles({name:'ip.png',mimeType:'image/png',buffer:preview});
 await page.getByText('ip.png',{exact:true}).waitFor();
 await page.getByLabel('ip.png 使用说明',{exact:true}).fill('用这个人物作封面主体，保留摄影表现');
 await page.getByRole('button',{name:'组装生图提示词',exact:true}).click();await page.getByRole('alert').filter({hasText:'请先保存参考图'}).waitFor();assert.equal(promptCalls,0);
 await page.getByRole('button',{name:'保存说明',exact:true}).click();await page.getByRole('button',{name:'保存说明',exact:true}).isDisabled();
 await page.getByText('参考说明已保存，请重新组合提示词',{exact:true}).waitFor();
 await page.locator('.generation-references').screenshot({path:`/private/tmp/reference-columns-${width}.png`});
 await page.getByRole('button',{name:'组装生图提示词',exact:true}).click();await promptGate;
 await page.getByRole('button',{name:'正在组装提示词…',exact:true}).waitFor();assert.ok(await page.locator('.candidate-card').isDisabled());
 await page.getByRole('status').filter({hasText:'gpt-5.6-luna 正在组装'}).waitFor();
 await page.locator('.report-card').screenshot({path:`/private/tmp/workflow-${width}-waiting.png`});
 if(width===390)assert.equal(await page.locator('.beui-text-shimmer').evaluate(el=>getComputedStyle(el).animationName),'none');
 releasePrompt();await page.locator('.report-card [role=alert]').filter({hasText:'AI 网关没有返回内容'}).waitFor();
 await page.getByRole('button',{name:'重试组装提示词',exact:true}).click();await page.locator('.report-card [role=alert]').filter({hasText:'仅重新保存'}).waitFor();
 await page.getByRole('button',{name:'重试组装提示词',exact:true}).click();await page.getByRole('region',{name:'生图提示词编辑区'}).waitFor();
 assert.equal(promptCalls,2);assert.equal(saveCalls,2);await page.waitForFunction(()=>document.querySelector('.prompt-card')===document.activeElement);
 assert.equal(await page.locator('.report-card .prompt-card').count(),1,'settings and prompt share one work card');
 assert.match(await page.locator('.prompt-length').textContent(),/\/ 2000 字/);
 const actualPrompt=page.getByRole('textbox',{name:'实际发送的完整提示词',exact:true});assert.match(await actualPrompt.inputValue(),/封面唯一IP身份来源/);assert.equal(await page.locator('.prompt-editor textarea').count(),1);
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 await page.getByRole('button',{name:'复制提示词',exact:true}).click();await page.getByRole('button',{name:'已复制',exact:true}).waitFor();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),await actualPrompt.inputValue());
 await page.getByRole('button',{name:'查看已生成提示词',exact:true}).click();assert.equal(promptCalls,2);
 await page.locator('.prompt-card').scrollIntoViewIfNeeded();await page.screenshot({path:`/private/tmp/generation-${width}-ready.png`,fullPage:true});
 await page.getByRole('button',{name:'确认并生图',exact:true}).click();await gate;await page.getByRole('button',{name:'正在生成…',exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'正在生成…',exact:true}).isDisabled());assert.ok(await page.getByRole('button',{name:/横版 4:3/}).isDisabled());release();
 await page.getByRole('alert').filter({hasText:'测试网关失败'}).waitFor();gate=new Promise(resolve=>{started=resolve;});
 await page.getByRole('button',{name:'重试生图',exact:true}).click();await gate;release();
 await page.getByRole('status').filter({hasText:'生成完成'}).waitFor();assert.equal(calls,2);
 assert.equal(await page.locator('.generated-result').count(),0);assert.equal(await page.locator('.hero-visual-image img').count(),1);assert.equal(await page.locator('.version-history').count(),1);
 await page.locator('.version-item').filter({hasText:'V1'}).click();assert.equal(await page.locator('.hero-visual-image img').getAttribute('src'),'/api/generated/versions/v1');assert.match(await page.locator('.prompt-editor textarea').first().inputValue(),/历史版本一的提示词/);
 assert.equal(await page.locator('.hero-actions').getByRole('link',{name:'下载原图'}).getAttribute('href'),'/api/generated/versions/v1?download=1');
 assert.equal(await page.locator('.image-download').count(),1,'one download beside current image, none in prompt or history');
 await page.locator('.version-item').filter({hasText:'V2'}).click();assert.equal(await page.locator('.image-download').getAttribute('href'),'/api/generated/versions/v2?download=1');
 await page.locator('.version-item').filter({hasText:'V1'}).click();
 await page.getByRole('button',{name:'确认主视觉参考',exact:true}).click();await page.getByRole('button',{name:'已确认参考',exact:true}).waitFor();assert.equal(confirmedVersion,'v1');
 await page.locator('.visual-suite-board').screenshot({path:`/private/tmp/unified-result-${width}.png`});
 await page.getByRole('button',{name:'修改这个版本',exact:true}).click();await page.getByRole('dialog',{name:'修改生成图片'}).locator('textarea').fill('卖点小一点');
 await page.getByLabel('本次参考说明',{exact:true}).fill('只借鉴边框');await page.getByLabel('上传本次改图参考',{exact:true}).setInputFiles({name:'edit-style.png',mimeType:'image/png',buffer:preview});await page.locator('.edit-reference-list figure').waitFor();
 await page.getByRole('dialog',{name:'修改生成图片'}).screenshot({path:`/private/tmp/direct-edit-${width}.png`});
 const modalBox=await page.locator('.revision-dialog').boundingBox();assert.ok(modalBox.x>=0&&modalBox.x+modalBox.width<=width,'edit dialog fits the mobile viewport');
 gate=new Promise(resolve=>{started=resolve;});
 await page.getByRole('button',{name:'确认修改并生成',exact:true}).click();await gate;
 const dialog=page.getByRole('dialog',{name:'修改生成图片'});
 assert.ok(await dialog.getByRole('button',{name:'正在修改图片…',exact:true}).isDisabled());assert.equal(calls,3);release();
 await dialog.getByRole('alert').filter({hasText:'测试网关失败'}).waitFor();assert.equal(await dialog.locator('textarea').inputValue(),'卖点小一点');assert.equal(await dialog.locator('.revision-image').getAttribute('src'),'/api/generated/versions/v1');assert.equal(await dialog.locator('.edit-reference-list figure').count(),1,'retry retains this edit reference');
 gate=new Promise(resolve=>{started=resolve;});await dialog.getByRole('button',{name:'重试改图',exact:true}).click();await gate;assert.equal(calls,4);release();
 await dialog.waitFor({state:'hidden'});
 assert.match(await page.locator('.prompt-editor textarea').first().inputValue(),/卖点小一点/);assert.match(await actualPrompt.inputValue(),/只借鉴边框/);assert.doesNotMatch(await page.locator('.prompt-editor textarea').first().inputValue(),/历史版本一|卖点继承|封面唯一IP/);
 await page.getByRole('button',{name:'修改这个版本',exact:true}).click();await dialog.getByRole('button',{name:'重组提示词',exact:true}).click();await dialog.locator('textarea').fill('重新安排整体版式');await dialog.getByRole('button',{name:'重新组合提示词',exact:true}).click();await dialog.waitFor({state:'hidden'});
 assert.equal(calls,4,'recompose must wait for a separate generation confirmation');assert.match(await actualPrompt.inputValue(),/重新组织标题与卖点布局/);
 await page.getByRole('button',{name:/方版 1:1/}).click();assert.equal(await page.locator('.prompt-card').count(),0,'changed size invalidates the old prompt');
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await context.close();console.log(`PASS generation UI ${width}: style words, compact report, valid ratio, beui busy/error/success states, visible error, retry, no overflow`);
}}finally{await browser.close();}
