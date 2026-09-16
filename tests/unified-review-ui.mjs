import {sharedUiRoute} from './ui-model-fixtures.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyProfile} from '../visual-rules/v1/index.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
const preview=await readFile(new URL('../public/selling-layouts/H.png',import.meta.url));
const profile=emptyProfile();profile.title.confidence=.7;
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:1000}});let confirmed=false,published=false,calls=0,primaryCalls=0,release,start;let gate=new Promise(resolve=>start=resolve);const errors=[];page.on('pageerror',error=>errors.push(error.message));const reopened=width===390;
 const asset={id:'asset',filename:'扉页4.png',displayName:'扉页4.png',projectId:'project',projectName:'测试项目',suiteId:'suite',suiteName:'测试套系',materialType:'TITLE_PAGE',colors:[],tags:[],coreElements:[],reviewState:'PENDING',reuseState:'REUSABLE',analysisStatus:'ANALYZED',embeddingStatus:'WAITING_VISUAL',previewUrl:'/api/assets/asset/preview',isPrimary:true};
 await page.route('**/api/**',async route=>{if(await sharedUiRoute(route))return;const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/preview'))return route.fulfill({contentType:'image/png',body:preview});
  if(path==='/api/review'){const body=route.request().postDataJSON();if(body.action==='primary'){primaryCalls++;assert.equal(body.assetId,'second');return route.fulfill({json:{message:'主参考已保存'}});}calls++;const item=body.items[0];assert.equal(item.assetId,'asset');assert.equal(item.revisionId,'revision');assert.equal(item.fields.displayName,'人工确认名称');assert.deepEqual(item.profile,profile);await new Promise(resolve=>{release=resolve;start();});if(calls===1)return route.fulfill({status:400,json:{error:'测试保存失败，请重试'}});confirmed=true;return route.fulfill({json:{message:'已确认 1 张，后台将自动入库'}});}
  const data=path==='/api/assets'?[{...asset,isPrimary:!primaryCalls,reviewState:confirmed?'CONFIRMED':'PENDING',embeddingStatus:published?'READY':'WAITING_VISUAL'},{...asset,id:'second',displayName:'礼盒封面.png',isPrimary:Boolean(primaryCalls),reviewState:'CONFIRMED',embeddingStatus:'READY'}]:path==='/api/visual-revisions'?[{id:'revision',asset_id:'asset',status:published?'READY':confirmed?'APPROVED':reopened?'WAITING_ELIGIBILITY':'PENDING',candidate:profile,confirmed:confirmed||reopened?profile:null},{id:'revision2',asset_id:'second',status:'READY',candidate:profile,confirmed:profile}]:path==='/api/projects'?[{id:'project',name:'测试项目',suites:[{id:'suite',name:'测试套系',assets:[asset]}]}]:[];
  return route.fulfill({json:data});
 });
 await page.goto(process.env.APP_URL||'http://localhost:3002');await page.getByRole('button',{name:/审核队列/}).click();await page.locator('.suite-primary-choice>summary').click();await page.getByRole('button',{name:'设为主参考：礼盒封面.png',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.primary-tile-selected')?.textContent.includes('礼盒封面.png'));assert.equal(primaryCalls,1);assert.equal(calls,0,'choosing primary does not implicitly confirm review');await page.locator('.suite-primary-choice').screenshot({path:`/private/tmp/review-primary-${width}.png`});
 if(reopened)await page.getByText('扉页 · 视觉档案已确认，还需确认基础信息',{exact:true}).waitFor();
 await page.getByRole('button',{name:'核对并确认'}).click();
 await page.getByRole('dialog',{name:'素材统一审核'}).waitFor();assert.equal(await page.locator('input[name=displayName]').inputValue(),'扉页4.png');await page.locator('input[name=displayName]').fill('人工确认名称');
 assert.equal(await page.locator('[name=reuseState],[name=adaptationNotes]').count(),0);assert.equal(await page.locator('.unified-visual-fields details').count(),6);
 await page.getByRole('dialog').screenshot({path:`/private/tmp/unified-review-dialog-${width}.png`});
 await page.getByRole('button',{name:'确认并入库',exact:true}).click();await gate;assert.ok(await page.getByRole('dialog').getByRole('button',{name:'正在保存审核…'}).isDisabled());release();await page.getByRole('dialog').getByRole('alert').filter({hasText:'测试保存失败'}).waitFor();assert.equal(await page.locator('input[name=displayName]').inputValue(),'人工确认名称');
 gate=new Promise(resolve=>start=resolve);await page.getByRole('button',{name:'确认并入库',exact:true}).click();await gate;release();await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.getByText('扉页 · 排队入库',{exact:true}).waitFor();assert.equal(await page.locator('.unified-review-row progress').count(),1);assert.match(await page.locator('.unified-review-stats').textContent(),/0 待确认/);assert.match(await page.locator('.unified-review-stats').textContent(),/1 处理中/);
 await page.screenshot({path:`/private/tmp/unified-review-${width}.png`,fullPage:true});published=true;await page.getByText('当前入库已完成，素材可在项目库查看。').waitFor();assert.equal(await page.locator('.unified-review-row').count(),0);assert.equal(calls,2);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.close();console.log(`PASS unified review ${width}: one confirmation, retained edits after failure, six visual groups, processing stays visible, published leaves queue`);
}}finally{await browser.close();}
