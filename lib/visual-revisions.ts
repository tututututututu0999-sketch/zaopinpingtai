import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {query,transaction} from './db';
import {RULE_VERSION,validateProfile,profileSections,type VisualProfile} from '@/visual-rules/v1/index.mjs';
export async function listVisualRevisions(){return (await query(`SELECT r.*,a.display_name,a.filename,a.reuse_state,a.review_state,a.active_visual_revision_id,s.name AS suite_name,active.confirmed AS active_profile,active.summary AS active_summary,a.visual_style AS legacy_style,a.layout_features AS legacy_layout FROM visual_revisions r JOIN assets a ON a.id=r.asset_id LEFT JOIN visual_suites s ON s.id=a.suite_id LEFT JOIN visual_revisions active ON active.id=a.active_visual_revision_id WHERE r.id=a.target_visual_revision_id ORDER BY s.name,a.filename`)).rows;}
export async function queueVisualUpgrade(assetIds?:string[],force=false){return transaction(async client=>{
 const assets=(await client.query(`SELECT * FROM assets WHERE preview_key IS NOT NULL ${assetIds?'AND id=ANY($1::uuid[])':''} ORDER BY id FOR UPDATE`,assetIds?[assetIds]:[])).rows;let queued=0;
 for(const asset of assets){
  const latest=asset.target_visual_revision_id?(await client.query('SELECT * FROM visual_revisions WHERE id=$1',[asset.target_visual_revision_id])).rows[0]:null;
  if(!force&&latest&&latest.rule_version===RULE_VERSION&&!['FAILED','WAITING_ELIGIBILITY'].includes(latest.status))continue;
  if(!force&&latest?.confirmed){await client.query("UPDATE visual_revisions SET status='APPROVED',error_message=NULL WHERE id=$1",[latest.id]);await client.query("UPDATE jobs SET status='QUEUED',attempts=0,error_message=NULL WHERE dedupe_key=$1",[`EMBED_VISUAL:${latest.id}`]);}
  else{const revision=(await client.query('INSERT INTO visual_revisions(asset_id,rule_version) VALUES($1,$2) RETURNING id',[asset.id,RULE_VERSION])).rows[0];await client.query('UPDATE assets SET target_visual_revision_id=$2 WHERE id=$1',[asset.id,revision.id]);await client.query("INSERT INTO jobs(job_type,dedupe_key,payload) VALUES('ANALYZE_VISUAL',$1,$2::jsonb)",[`ANALYZE_VISUAL:${revision.id}`,JSON.stringify({revisionId:revision.id,assetId:asset.id})]);}queued++;
 }return {queued,total:assets.length};
});}
export async function confirmVisualRevisions(items:{id:string;profile:VisualProfile;adaptationNotes?:string}[],client?:PoolClient){
 if(!items.length||items.length>100||new Set(items.map(item=>item.id)).size!==items.length)throw new Error('请选择1-100张不重复的待审核素材');
 for(const item of items){validateProfile(item.profile);if(item.adaptationNotes!==undefined&&typeof item.adaptationNotes!=='string')throw new Error('改造要求格式无效');}
 const confirm=async(client:PoolClient)=>{
  const rows=(await client.query(`SELECT r.*,a.reuse_state,a.target_visual_revision_id,a.preview_key FROM visual_revisions r JOIN assets a ON a.id=r.asset_id WHERE r.id=ANY($1::uuid[]) ORDER BY a.id FOR UPDATE OF a,r`,[items.map(item=>item.id)])).rows;
  if(rows.length!==items.length)throw new Error('部分修订不存在，请刷新');
  for(const row of rows){const item=items.find(item=>item.id===row.id)!;
   if(row.target_visual_revision_id!==row.id||row.status!=='PENDING')throw new Error('候选已变化或已确认，请刷新');
   if(!row.preview_key||row.reuse_state==='NOT_REUSABLE')throw new Error('缺少预览或不可复用素材不能发布');
   const notes=item.adaptationNotes?.trim() ?? row.adaptation_notes ?? '';
   const summary=profileSections(item.profile).join('\n');const hash=createHash('sha256').update(JSON.stringify({rule:RULE_VERSION,profile:item.profile,notes:notes,preview:row.preview_key})).digest('hex');
   await client.query("UPDATE visual_revisions SET confirmed=$2::jsonb,adaptation_notes=$3,summary=$4,content_hash=$5,status='APPROVED',updated_at=now() WHERE id=$1",[row.id,JSON.stringify(item.profile),notes,summary,hash]);
   await client.query("INSERT INTO reviews(asset_id,actor,before_state,after_state) VALUES($1,'local-admin',$2::jsonb,$3::jsonb)",[row.asset_id,JSON.stringify(row),JSON.stringify({visualRevisionId:row.id,...item})]);
   await client.query("INSERT INTO jobs(job_type,dedupe_key,payload) VALUES('EMBED_VISUAL',$1,$2::jsonb) ON CONFLICT(dedupe_key) DO NOTHING",[`EMBED_VISUAL:${row.id}`,JSON.stringify({revisionId:row.id,assetId:row.asset_id})]);
  }return {confirmed:rows.length};
 };return client?confirm(client):transaction(confirm);
}
