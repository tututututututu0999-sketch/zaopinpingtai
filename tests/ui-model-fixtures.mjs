export const statusFixture={total:33,indexed:13,searchable:13,checkedAt:'2026-09-10',projects:[{id:'project',name:'已索引项目',total:13,indexed:13,searchable:13,pendingReview:0,waitingVector:0,missingPrimary:0},{id:'waiting',name:'等待视觉确认项目',total:20,indexed:0,searchable:0,pendingReview:0,waitingVector:20,missingPrimary:1}]};
export async function sharedUiRoute(route){const path=new URL(route.request().url()).pathname;
 if(path==='/api/text-models'){await route.fulfill({json:{defaultModel:'gpt-5.6-luna',models:['gpt-5.6-luna','gpt-5.6-terra','qwen-3.8-free'].map(id=>({id,available:true,vision:true,message:'识图测试通过',latencyMs:2100,checkedAt:'2026-09-11'}))}});return true;}
 if(path==='/api/archive-status'){await route.fulfill({json:statusFixture});return true;}return false;
}
