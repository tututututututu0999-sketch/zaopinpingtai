import {transaction} from './db';
import {reviewAssetInTransaction,enqueueEmbeddingsForSuite,type ReviewInput} from './archive';
import {confirmVisualRevisions} from './visual-revisions';
import type {VisualProfile} from '@/visual-rules/v1/index.mjs';
type Item={assetId:string;fields?:ReviewInput;revisionId?:string;profile?:VisualProfile};
export async function confirmReview(items:Item[]){
 if(!Array.isArray(items)||!items.length||items.length>100||new Set(items.map(item=>item.assetId)).size!==items.length)throw new Error('请选择1–100张不重复的素材');
 return transaction(async client=>{
  // Lock in a deterministic order and publish both confirmations atomically.
  const rows=(await client.query('SELECT * FROM assets WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[items.map(item=>item.assetId)])).rows;
  if(rows.length!==items.length)throw new Error('部分素材已不存在，请刷新');
  for(const row of rows){const item=items.find(item=>item.assetId===row.id)!;
   if(!row.preview_key)throw new Error('图片预览尚未准备好');
   const revision=(await client.query('SELECT * FROM visual_revisions WHERE id=$1 FOR UPDATE',[row.target_visual_revision_id])).rows[0];
   const retained=revision?.confirmed&&row.review_state!=='CONFIRMED'&&['WAITING_ELIGIBILITY','FAILED','APPROVED','READY'].includes(revision.status);
   if(!revision||(!['PENDING','READY'].includes(revision.status)&&!retained))throw new Error('视觉识别尚未完成，请等待或重试识别');
   if(item.revisionId!==revision.id)throw new Error('视觉候选已变化，请重新查看后确认');
   if(revision.status==='PENDING'&&(item.revisionId!==revision.id||!item.profile))throw new Error('视觉候选已变化，请重新查看后确认');
   if(item.fields){const f=item.fields;if(typeof f.projectName!=='string'||typeof f.suiteName!=='string'||typeof f.isPrimary!=='boolean'||!['BOOK_COVER','TITLE_PAGE','GIFT_BOX','PRODUCT_BOOKLET','WALL_CHART','OTHER'].includes(f.materialType)||![f.colors,f.tags,f.coreElements].every(Array.isArray))throw new Error('基础信息格式无效');
    const suite=(await client.query('SELECT s.name,s.primary_asset_id,p.name AS project_name FROM visual_suites s JOIN projects p ON p.id=s.project_id WHERE s.id=$1',[row.suite_id])).rows[0];
    const sameSuite=suite?.name===f.suiteName.trim()&&suite?.project_name===f.projectName.trim();
    // Primary selection belongs to its separate suite action, not a stale form.
    await reviewAssetInTransaction(client,row.id,{...f,isPrimary:Boolean(sameSuite&&suite.primary_asset_id===row.id)});
    if(!sameSuite)await client.query('UPDATE visual_suites SET primary_asset_id=NULL WHERE id=$1 AND primary_asset_id=$2',[row.suite_id,row.id]);
   }
   else if(row.review_state!=='CONFIRMED')throw new Error('请同时确认素材基础信息');
   if(revision.status==='PENDING')await confirmVisualRevisions([{id:revision.id,profile:item.profile!}],client);
   else if(retained){
    // Reopening basic metadata does not revoke or overwrite the visual snapshot.
    await client.query("UPDATE visual_revisions SET status='APPROVED',error_message=NULL WHERE id=$1",[revision.id]);
    await client.query("INSERT INTO jobs(job_type,dedupe_key,payload) VALUES('EMBED_VISUAL',$1,$2::jsonb) ON CONFLICT(dedupe_key) DO UPDATE SET status='QUEUED',attempts=0,error_message=NULL WHERE jobs.status<>'RUNNING'",[`EMBED_VISUAL:${revision.id}`,JSON.stringify({revisionId:revision.id,assetId:row.id})]);
   }
  }
  return {confirmed:items.length,message:`已确认 ${items.length} 张，后台将自动入库；缺少主参考的套系会显示待补充。`};
 });
}
export async function chooseSuitePrimary(suiteId:string,assetId:string){
 return transaction(async client=>{
  const asset=(await client.query('SELECT * FROM assets WHERE id=$1 AND suite_id=$2 FOR UPDATE',[assetId,suiteId])).rows[0];
  if(!asset||!asset.preview_key||asset.reuse_state==='NOT_REUSABLE')throw new Error('请选择该套系中有预览且可复用的素材');
  await client.query('UPDATE visual_suites SET primary_asset_id=$2 WHERE id=$1',[suiteId,assetId]);
  await enqueueEmbeddingsForSuite(client,suiteId);
  await client.query("UPDATE visual_revisions r SET status='APPROVED',error_message=NULL FROM assets a WHERE a.suite_id=$1 AND a.target_visual_revision_id=r.id AND r.status='WAITING_ELIGIBILITY' AND r.confirmed IS NOT NULL",[suiteId]);
  await client.query("UPDATE jobs j SET status='QUEUED',attempts=0,error_message=NULL FROM visual_revisions r JOIN assets a ON a.target_visual_revision_id=r.id WHERE a.suite_id=$1 AND r.status='APPROVED' AND j.dedupe_key='EMBED_VISUAL:'||r.id::text AND j.status<>'RUNNING'",[suiteId]);
  return {message:'套系主参考已保存；已确认素材将自动继续入库。'};
 });
}
