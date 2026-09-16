import sharp from 'sharp';
import {PROFILE_PROMPT,validateProfile,profileSections} from './index.mjs';
export async function analyseVisual(pool,readObject,visionJson,revisionId){
 const row=(await pool.query('SELECT r.*,a.preview_key,a.target_visual_revision_id FROM visual_revisions r JOIN assets a ON a.id=r.asset_id WHERE r.id=$1',[revisionId])).rows[0];
 if(!row||row.target_visual_revision_id!==row.id||row.confirmed)return;
 await pool.query("UPDATE visual_revisions SET status='ANALYZING',error_message=NULL WHERE id=$1",[revisionId]);
 const preview=await sharp(await readObject(row.preview_key)).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toBuffer();
 const candidate=validateProfile(await visionJson(process.env.LUNA_MODEL||'gpt-5.6-luna',[{role:'system',content:[{type:'input_text',text:PROFILE_PROMPT}]},{role:'user',content:[{type:'input_text',text:'仅识别可见视觉结构，不复制营销文案。'},{type:'input_image',image_url:`data:image/jpeg;base64,${preview.toString('base64')}`}]}]));
 await pool.query("UPDATE visual_revisions SET candidate=$2::jsonb,status='PENDING',updated_at=now() WHERE id=$1 AND confirmed IS NULL",[revisionId,JSON.stringify(candidate)]);
}
export async function embedVisual(pool,readObject,embed,revisionId){
 const row=(await pool.query(`SELECT r.*,a.preview_key,a.target_visual_revision_id,a.review_state,a.reuse_state,p.review_state AS primary_review,p.reuse_state AS primary_reuse FROM visual_revisions r JOIN assets a ON a.id=r.asset_id LEFT JOIN visual_suites s ON s.id=a.suite_id LEFT JOIN assets p ON p.id=s.primary_asset_id WHERE r.id=$1`,[revisionId])).rows[0];
 if(!row||row.target_visual_revision_id!==row.id||!row.confirmed)return;
 const eligible=a=>a.review_state==='CONFIRMED'&&a.reuse_state!=='NOT_REUSABLE'&&a.primary_review==='CONFIRMED'&&a.primary_reuse!=='NOT_REUSABLE';
 if(!eligible(row)){await pool.query("UPDATE visual_revisions SET status='WAITING_ELIGIBILITY',error_message='等待素材审核和套系主参考确认' WHERE id=$1",[revisionId]);return;}
 await pool.query("UPDATE visual_revisions SET status='PROCESSING_TEXT',error_message=NULL WHERE id=$1",[revisionId]);
 const response=await fetch(`${process.env.EMBEDDING_SERVICE_URL?.replace(/\/$/,'')}/embed`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'text',content:'',sections:profileSections(row.confirmed)}),signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw new Error(`视觉文本向量失败(${response.status})`);
 const text=await response.json();
 if(!Array.isArray(text.embedding)||text.embedding.length!==1024||!text.embedding.every(Number.isFinite)||!text.serializedContent)throw new Error('视觉文本向量响应无效');
 await pool.query("UPDATE visual_revisions SET status='PROCESSING_IMAGE',summary=$2 WHERE id=$1",[revisionId,text.serializedContent]);
 const image=await embed('image',(await readObject(row.preview_key)).toString('base64'));
 const client=await pool.connect();try{
  await client.query('BEGIN');
  const current=(await client.query(`SELECT a.*,p.review_state AS primary_review,p.reuse_state AS primary_reuse FROM assets a LEFT JOIN visual_suites s ON s.id=a.suite_id LEFT JOIN assets p ON p.id=s.primary_asset_id WHERE a.id=$1 FOR UPDATE OF a`,[row.asset_id])).rows[0];
  if(!current||current.target_visual_revision_id!==row.id||current.preview_key!==row.preview_key||!eligible(current))await client.query("UPDATE visual_revisions SET status='WAITING_ELIGIBILITY' WHERE id=$1",[revisionId]);
  else{
   await client.query(`INSERT INTO asset_embeddings(asset_id,text_embedding,image_embedding,model_name,visual_revision_id,content_hash) VALUES($1,$2::vector,$3::vector,'jinaai/jina-clip-v2',$4,$5) ON CONFLICT(asset_id) DO UPDATE SET text_embedding=EXCLUDED.text_embedding,image_embedding=EXCLUDED.image_embedding,visual_revision_id=EXCLUDED.visual_revision_id,content_hash=EXCLUDED.content_hash,updated_at=now()`,[row.asset_id,`[${text.embedding}]`,`[${image}]`,revisionId,row.content_hash]);
   await client.query("UPDATE assets SET active_visual_revision_id=$2,adaptation_notes=$3,embedding_status='READY' WHERE id=$1",[row.asset_id,revisionId,row.adaptation_notes]);
   await client.query("UPDATE visual_revisions SET status='READY',error_message=NULL,updated_at=now() WHERE id=$1",[revisionId]);
  }await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
