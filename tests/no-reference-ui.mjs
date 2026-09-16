import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sharedUiRoute} from './ui-model-fixtures.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
const image=await readFile(new URL('../public/selling-layouts/H.png',import.meta.url));
const analysis={source:'luna',draftId:'draft',revision:1,originalBrief:'小学数学礼盒，文字采用厚重圆润粗体，每条卖点搭配扁平图标',materialType:'礼盒',grade:'小学',subject:'数学',designDirection:'明亮的数学学习礼盒',designKeywords:['童趣','活力','成就'],hardConstraints:[{field:'title',operator:'include',value:'ROUNDED_OUTLINE',evidence:'文字采用厚重圆润粗体'}],unsupportedConstraints:[],assumptions:[],preferences:{title:[],selling:[],subject:[]},mustAvoid:[],searchQuery:'数学礼盒'};
const report={source:'terra',summary:'按需求自主设计',reasons:['文案明确'],reusableElements:['圆润粗体'],riskNotes:[]};
const prompt={source:'terra',prompt:'生成明亮的数学礼盒',negativePrompt:'错误文字',creativity:'exploratory',referencePlan:{sellingSourceId:'',sellingType:'',sellingInstruction:'按本次文案自主设计卖点'}};
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:1000}});let tasks=0,images=0;const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  if(await sharedUiRoute(route))return;
  const req=route.request(),path=new URL(req.url()).pathname;let data=[];
  if(path.startsWith('/api/generated/'))return route.fulfill({contentType:'image/png',body:image});
  if(path==='/api/brief/analyse'||path==='/api/brief/confirm')data=analysis;
  else if(path==='/api/design-tasks'){tasks++;assert.equal(req.postDataJSON().referenceSource,'none');assert.deepEqual(req.postDataJSON().referenceAssetIds,[]);data={id:'none',status:'REFERENCE_CONFIRMED'};}
  else if(path==='/api/brief/report')data=report;
  else if(path==='/api/design-tasks/none')data=req.method()==='GET'?{versions:[]}:{id:'none',status:req.postDataJSON().status};
  else if(path==='/api/brief/prompt'){assert.equal(req.postDataJSON().size,'1536x1152');data={...prompt,size:'1536x1152'};}
  else if(path==='/api/images/generate'){images++;data={imageUrl:'/api/generated/versions/test',versionId:'test',usedImageReferences:0,size:'1536x1152'};}
  else if(path==='/api/retrieve'||path.includes('/references'))throw new Error('No-reference branch must not retrieve or upload');
  return route.fulfill({json:data});
 });
 await page.goto(process.env.APP_URL||'http://localhost:3002');await page.getByRole('button',{name:'分析设计需求',exact:true}).click();
 await page.getByText('成图要求与参考筛选',{exact:true}).click();
 assert.match(await page.locator('.constraint-details').textContent(),/采用圆润厚描边/);assert.doesNotMatch(await page.locator('.constraint-details').textContent(),/ROUNDED_OUTLINE/);
 await page.getByRole('button',{name:'确认方向并直接创作',exact:true}).click();await page.getByRole('heading',{name:'生成设置',exact:true}).waitFor();
 await page.locator('.direction-review').screenshot({path:`/private/tmp/no-reference-${width}.png`});
 assert.equal(await page.locator('.analysis-strip,.direction-filters,.archive-coverage,.generation-references,.creativity-picker').count(),0);
 await page.getByRole('button',{name:/横版 4:3/}).click();await page.getByRole('button',{name:'组装生图提示词',exact:true}).click();await page.getByRole('region',{name:'生图提示词编辑区'}).waitFor();
 await page.getByRole('button',{name:'确认并生图',exact:true}).click();await page.locator('.hero-visual-image img').waitFor();
 assert.equal(tasks,1);assert.equal(images,1);assert.equal(await page.locator('.hero-actions').getByRole('link',{name:'下载原图'}).getAttribute('href'),'/api/generated/versions/test?download=1');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 await page.close();console.log(`PASS no-reference ${width}: scoped legacy rules, no retrieve/upload, size/prompt/image/download`);
}}finally{await browser.close();}
