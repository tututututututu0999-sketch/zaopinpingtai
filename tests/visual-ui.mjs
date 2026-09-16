import {sharedUiRoute} from './ui-model-fixtures.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyProfile,RULE_VERSION} from '../visual-rules/v1/index.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}});
const preview=await readFile(new URL('../数学思维冲顶计划/主书封面1.png',import.meta.url));
const profile=emptyProfile();profile.title={...profile.title,status:'OBSERVED',confidence:.75,evidence:'标题具有明显粗描边',types:['ROUNDED_OUTLINE'],outline:'粗描边'};
const asset={visualProfile:profile,id:'asset-fixture',filename:'礼盒封面.png',displayName:'礼盒封面.png',projectId:'project-fixture',projectName:'测试项目',suiteId:'suite-fixture',suiteName:'测试套系',materialType:'GIFT_BOX',grade:'二年级',subject:'数学',colors:[],tags:[],coreElements:[],visualStyle:'明快',layoutFeatures:'上文下图',description:'标题与卖点结构',reviewState:'CONFIRMED',reuseState:'REUSABLE',embeddingStatus:'READY',analysisStatus:'ANALYZED',isPrimary:true,previewUrl:'/api/assets/asset-fixture/preview'};
const brief={draftId:'draft-fixture',revision:1,ruleVersion:RULE_VERSION,originalBrief:'外教伴读',source:'luna',materialType:'礼盒',grade:'未指定',subject:'英语',productLine:'学习礼盒',audience:'小学生',intent:'陪伴学习',usageScenario:'家庭伴读',productValue:'英语学习',emotionalValue:'陪伴成长',designDirection:'真人肖像互动伴读礼盒设计',designKeywords:['正式','活力','成就'],assumptions:['年级未指定'],preferences:{title:[],selling:[],subject:[]},hardConstraints:[],unsupportedConstraints:[],styleKeywords:[],colorKeywords:[],mustAvoid:[],searchQuery:'英语伴读礼盒'};
try{for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];let retrieves=0,revision=1;page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{if(await sharedUiRoute(route))return;const request=route.request();const path=new URL(request.url()).pathname;let data;
  if(path.endsWith('/preview'))return route.fulfill({contentType:'image/png',body:preview});
  if(path==='/api/assets')data=[asset];
  else if(path==='/api/projects')data=[{id:asset.projectId,name:asset.projectName,suites:[{id:asset.suiteId,name:asset.suiteName,assets:[asset]}]}];
  else if(path==='/api/imports')data=[];
  else if(path==='/api/brief/analyse'){const body=request.postDataJSON();if(body.supplement)revision++;data={...brief,revision,unsupportedConstraints:['用户未明确礼盒尺寸、结构、开合方式与印刷工艺'],...revision>1?{unsupportedConstraints:['参考图必须采用烫金工艺'],designDirection:'二维插画互动伴读礼盒设计',designKeywords:['正式','活力','成就']}: {}};}
  else if(path==='/api/brief/confirm')data={...brief,revision};
  else if(path==='/api/retrieve'){retrieves++;data={candidates:[{suiteId:asset.suiteId,projectId:asset.projectId,projectName:asset.projectName,suiteName:asset.suiteName,score:75,primary:asset,helpers:[],matchReasons:['匹配标题结构','旧版规则']}],mode:'pgvector'};}
  else if(path==='/api/visual-revisions')data=[{id:'revision-fixture',asset_id:asset.id,display_name:asset.displayName,filename:asset.filename,suite_name:asset.suiteName,status:'PENDING',candidate:profile,confirmed:null,active_profile:profile,active_visual_revision_id:'revision-fixture',legacy_style:'活泼教学风格',legacy_layout:'上文下图',adaptation_notes:'',reuse_state:'REUSABLE'},{id:'published',asset_id:'published',display_name:'已发布不应出现',suite_name:asset.suiteName,status:'READY',confirmed:profile}];
  else throw new Error(`Unexpected UI request ${path}`);
  await route.fulfill({json:data});
 });
 await page.goto(process.env.APP_URL||'http://localhost:3000');await page.getByRole('button',{name:'分析设计需求',exact:true}).click();await page.getByRole('heading',{name:'设计方向',exact:true}).waitFor();assert.equal(retrieves,0);
 assert.equal(await page.getByRole('button',{name:'修正设计方向'}).isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'确认方向并检索',exact:true}).isEnabled(),true);
 await page.getByRole('button',{name:'确认方向并检索',exact:true}).click();await page.getByRole('heading',{name:'按匹配程度选择主参考与辅助素材'}).waitFor();assert.equal(retrieves,1);
 await page.screenshot({path:`/private/tmp/visual-v1-${viewport.width}-direction.png`,fullPage:true});
 await page.getByPlaceholder('例如：改为插画，不要真人').fill('改为插画，不要真人');assert.equal(await page.getByRole('button',{name:'重新检索素材'}).isDisabled(),true);await page.getByRole('button',{name:'修正设计方向'}).click();await page.getByText('二维插画互动伴读礼盒设计',{exact:true}).waitFor();assert.equal(retrieves,1);assert.equal(await page.getByRole('heading',{name:'按匹配程度选择主参考与辅助素材'}).count(),0);
 assert.equal(await page.getByRole('button',{name:'确认方向并检索',exact:true}).isDisabled(),true);
 assert.equal(await page.getByRole('alert').filter({hasText:'参考图必须采用烫金工艺'}).isVisible(),true);
 await page.screenshot({path:`/private/tmp/visual-v1-${viewport.width}-blocked.png`,fullPage:true});
 await page.getByRole('button',{name:'审核队列'}).click();await page.getByRole('heading',{name:'统一审核'}).waitFor();assert.equal(await page.getByText('已发布不应出现',{exact:true}).count(),0);await page.locator('.visual-row-open').click();await page.getByRole('dialog',{name:'素材统一审核'}).waitFor();assert.ok(await page.locator('.unified-visual-fields details').filter({hasText:'标题字体设计'}).getByText('需要核对',{exact:true}).isVisible());
 assert.equal(await page.locator('.visual-editor .preserve-text').count(),0);assert.equal(await page.locator('.visual-previous').count(),0);await page.screenshot({path:`/private/tmp/visual-v1-${viewport.width}-review.png`,fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);assert.equal(await page.locator('dialog img').evaluate(img=>img.naturalWidth>0),true);assert.deepEqual(errors,[]);
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 if(viewport.width<780)await page.getByLabel('打开项目库',{exact:true}).selectOption(asset.projectId);else await page.getByRole('button',{name:/测试项目/}).first().click();
 await page.getByRole('button',{name:'查看 礼盒封面.png 全部信息',exact:true}).click();
 await page.getByRole('dialog',{name:'素材完整信息'}).waitFor();
 assert.equal(await page.locator('.visual-profile-group').count(),6);
 assert.equal(await page.locator('.asset-detail-dialog .preserve-text').count(),0);
 await page.locator('.asset-detail-dialog').screenshot({path:`/private/tmp/visual-profile-${viewport.width}.png`});
 assert.equal(await page.locator('.asset-detail-dialog').evaluate(el=>el.scrollWidth>el.clientWidth),false);
 await context.close();console.log(`PASS UI ${viewport.width}: direction confirmation, supplement revision, queue hides published, review deduplication, six detail groups, no overflow/errors`);
}}finally{await browser.close();}
