import assert from 'node:assert/strict';
import {sharedUiRoute,statusFixture} from './ui-model-fixtures.mjs';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
const preview=await readFile(new URL('../public/selling-layouts/H.png',import.meta.url));
const brief={source:'luna',textModel:'gpt-5.6-luna',draftId:'draft',revision:1,materialType:'礼盒',grade:'未指定',subject:'未指定',designDirection:'正式明快的学习礼盒',designKeywords:['正式','活力','成就'],hardConstraints:[],unsupportedConstraints:[],assumptions:[],preferences:{title:[],selling:[],subject:[]},searchQuery:'礼盒'};
const asset={id:'asset',displayName:'礼盒.png',filename:'礼盒.png',suiteName:'套系',materialType:'GIFT_BOX',previewUrl:'/api/assets/asset/preview'};
const report={source:'terra',model:'gpt-5.6-terra',summary:'保留清晰标题层级',reasons:['结构明确'],reusableElements:['四栏卖点'],riskNotes:[]};
try{for(const width of [1440,390]){const page=await browser.newPage({viewport:{width,height:1000}});let statusCalls=0,selected='gpt-5.6-luna',reportCalls=0;const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;
  if(path==='/api/archive-status'){statusCalls++;return route.fulfill({json:{...statusFixture,indexed:statusCalls>1?14:13}});}
  if(await sharedUiRoute(route))return;
  if(path.endsWith('/preview'))return route.fulfill({contentType:'image/png',body:preview});
  let data=[];
  if(path==='/api/brief/analyse'){assert.equal(req.postDataJSON().textModel,'gpt-5.6-luna');data=brief;}
  else if(path==='/api/brief/confirm')data=brief;
  else if(path==='/api/retrieve')data={candidates:[{suiteId:'suite',suiteName:'套系',projectName:'项目',primary:asset,helpers:[],score:75,matchReasons:[]}]};
  else if(path==='/api/design-tasks'){assert.equal(req.postDataJSON().textModel,'gpt-5.6-luna');data={id:'task',status:'REFERENCE_CONFIRMED'};}
  else if(path==='/api/brief/report'){reportCalls++;if(reportCalls===1)return route.fulfill({status:502,json:{error:'本次模型超时'}});assert.equal(selected,'gpt-5.6-terra');data=report;}
  else if(path==='/api/design-tasks/task'){if(req.postDataJSON().action==='text-model')selected=req.postDataJSON().model;data={id:'task',status:req.postDataJSON().status||'REFERENCE_CONFIRMED'};}
  return route.fulfill({json:data});
 });
 await page.goto(process.env.APP_URL||'http://localhost:3002');await page.getByLabel('文本与识图模型',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('option[value="qwen-3.8-free"]'));
 assert.equal(await page.locator('option[value="deepseek-v4-flash"],option[value="gpt-5.4-mini"]').count(),0);
 assert.equal(await page.locator('option[value="qwen-3.8-free"]').evaluate(option=>option.disabled),false);
 await page.getByRole('button',{name:'分析设计需求',exact:true}).click();await page.getByRole('button',{name:'确认方向并检索',exact:true}).click();
 await page.locator('.archive-coverage summary').click();await page.getByText('等待视觉确认项目',{exact:true}).waitFor();assert.match(await page.locator('.archive-coverage').textContent(),/20 张等待视觉规则/);
 await page.getByRole('button',{name:'确认参考并生成报告',exact:true}).click();await page.getByRole('alert').filter({hasText:'本次模型超时'}).waitFor();
 await page.getByLabel('文本与识图模型',{exact:true}).selectOption('gpt-5.6-terra');await page.getByText('已切换创作模型，参考和历史保留。',{exact:true}).waitFor();
 await page.getByRole('button',{name:'重试生成报告',exact:true}).click();await page.locator('.generation-report-details>summary').click();await page.getByRole('heading',{name:'本次采用'}).waitFor();assert.equal(reportCalls,2);
 await page.waitForFunction(()=>document.querySelector('.sidebar-index-count')?.textContent?.includes('14 已索引素材'));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 await page.locator('.text-model-picker').screenshot({path:`/private/tmp/text-model-picker-${width}.png`});await page.close();console.log(`PASS models/counts ${width}: vision gate, explicit model switch after failure, references retained, all-project coverage, refreshed count`);
}}finally{await browser.close();}
