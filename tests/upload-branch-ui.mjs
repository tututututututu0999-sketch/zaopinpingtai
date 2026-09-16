import {sharedUiRoute} from './ui-model-fixtures.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
const image=await readFile(new URL('../public/selling-layouts/H.png',import.meta.url));
const analysis={draftId:'draft',revision:1,ruleVersion:'v1',source:'luna',designDirection:'正式而明快的英语礼盒',designKeywords:['正式','活力','成就'],materialType:'礼盒',grade:'未指定',subject:'未指定',hardConstraints:[],unsupportedConstraints:[],assumptions:[],preferences:{title:[],selling:[],subject:[]},mustAvoid:[],searchQuery:'英语礼盒'};
const report={source:'terra',summary:'参考上下线框排版。',reasons:['信息清晰'],reusableElements:['线框卖点'],riskNotes:[],referenceRevision:1};
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:1000}});let refs=[],retrievals=0,confirms=0,reports=0,tasks=0;const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{if(await sharedUiRoute(route))return;const request=route.request(),path=new URL(request.url()).pathname;let data=[];
  if(path.startsWith('/api/generated/'))return route.fulfill({body:image,contentType:'image/png'});
  if(path==='/api/brief/analyse'||path==='/api/brief/confirm')data=analysis;
  else if(path==='/api/design-tasks'){tasks++;assert.equal(request.postDataJSON().referenceSource,'upload');assert.deepEqual(request.postDataJSON().referenceAssetIds,[]);data={id:'upload',status:'REFERENCE_PENDING'};}
  else if(path==='/api/retrieve'){retrievals++;data={candidates:[{suiteId:'suite',suiteName:'测试套系',projectName:'测试项目',score:70,primary:{id:'asset',displayName:'测试封面',filename:'cover.png',materialType:'GIFT_BOX',previewUrl:'/api/generated/ref'},helpers:[],matchReasons:['风格匹配']}]};}
  else if(path==='/api/design-tasks/upload/references'){refs=[{id:'character',filename:'portrait.png',role:'character',note:'',url:'/api/generated/portrait'},{id:'reference',filename:'long-reference-filename-041f94c9-95c1-421d-ad90-72e097f094fe.png',role:'style',note:'',url:'/api/generated/ref'}];data=refs;}
  else if(path==='/api/design-tasks/upload/confirm-uploads'){confirms++;data={status:'REFERENCE_CONFIRMED'};}
  else if(path==='/api/brief/report'){reports++;if(reports===1)return route.fulfill({status:502,json:{error:'上游生成失败，请重试'}});data=report;}
  else if(path==='/api/design-tasks/upload')data={id:'upload',status:request.postDataJSON().status};
  else if(path==='/api/brief/prompt')data={source:'terra',prompt:'保留线框结构生成封面',negativePrompt:'错误文字',referenceRevision:1};
  else if(path==='/api/design-tasks/references/reference'){refs[1].note=request.postDataJSON().note;data={note:refs[1].note};}
  return route.fulfill({json:data});
 });
 await page.goto(process.env.APP_URL||'http://localhost:3002');await page.getByRole('button',{name:'分析设计需求',exact:true}).click();
 await page.getByRole('button',{name:'确认方向并上传参考',exact:true}).click();
 await page.getByRole('heading',{name:'确认本次参考图'}).waitFor();assert.ok(await page.getByRole('button',{name:'确认上传参考并继续',exact:true}).isDisabled());
 assert.equal(await page.locator('.analysis-strip,.direction-filters,.candidates-card').count(),0);
 await page.locator('input[type=file][accept="image/png,image/jpeg,image/webp"]').setInputFiles({name:'layout.png',mimeType:'image/png',buffer:image});
 await page.locator('.upload-reference-card').first().waitFor();assert.equal(await page.locator('.reference-upload-panel textarea').count(),2);
 // Switching must preserve unsaved notes and avoid repeating upload/AI calls.
 await page.getByLabel('portrait.png 使用说明',{exact:true}).fill('保留真人脸型');
 await page.getByRole('button',{name:'确认方向并检索',exact:true}).click();await page.locator('.candidate-card').waitFor();
 assert.equal(await page.locator('#upload-branch,.reference-upload-panel').count(),0);
 await page.getByRole('button',{name:'继续独立上传参考',exact:true}).click();await page.locator('#upload-branch').waitFor();
 assert.equal(await page.getByLabel('portrait.png 使用说明',{exact:true}).inputValue(),'保留真人脸型');assert.equal(tasks,1);assert.equal(retrievals,1);
 await page.getByLabel('portrait.png 使用说明',{exact:true}).fill('');
 await page.getByRole('button',{name:'确认上传参考并继续',exact:true}).click();await page.getByRole('alert').filter({hasText:'上游生成失败'}).waitFor();
 assert.equal(await page.locator('.upload-reference-card').count(),2,'failure retains upload');
 await page.getByRole('button',{name:'确认上传参考并继续',exact:true}).click();await page.locator('.generation-report-details>summary').click();await page.getByRole('heading',{name:'本次采用'}).waitFor();
 assert.equal(await page.locator('.reference-upload-panel').count(),1,'only one upload editor after confirmation');
 await page.locator('.generation-references').screenshot({path:`/private/tmp/upload-branch-${width}.png`});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByRole('button',{name:'组装生图提示词',exact:true}).click();await page.getByRole('region',{name:'生图提示词编辑区'}).waitFor();
 await page.getByRole('button',{name:'继续套系库参考',exact:true}).click();await page.locator('.candidate-card').waitFor();
 assert.equal(await page.locator('.report-card').count(),0);
 await page.getByRole('button',{name:'继续独立上传参考',exact:true}).click();await page.getByRole('region',{name:'生图提示词编辑区'}).waitFor();
 assert.equal(reports,2);assert.equal(retrievals,1);assert.equal(tasks,1);
 await page.locator('.reference-upload-panel textarea').last().fill('保留线框与分栏');await page.getByRole('button',{name:'保存说明',exact:true}).last().click();
 await page.getByRole('heading',{name:'确认本次参考图'}).waitFor();assert.equal(await page.locator('.prompt-card').count(),0);assert.equal(await page.locator('.report-card').count(),0);assert.equal(retrievals,1);assert.equal(confirms,2);assert.deepEqual(errors,[]);
 await page.close();console.log(`PASS independent upload ${width}: no catalog, one note, failure recovery, confirmation invalidation, no overflow`);
}}finally{await browser.close();}
