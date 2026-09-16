import {constraintLabel,scopeBriefConstraints} from '@/visual-rules/constraint-scope.mjs';
import {query,transaction} from './db';
import type {BriefAnalysis} from './brief';
import type {ArchiveAsset,CandidateSuite} from './archive-types';
import {matchesConstraints,preferenceMatch,type VisualProfile} from '@/visual-rules/v1/index.mjs';
type Row={id:string;filename:string;display_name:string;material_type:string;grade:string;subject:string;colors:string[];tags:string[];visual_style:string;layout_features:string;core_elements:string[];ocr_text:string;description:string;review_state:string;reuse_state:string;confidence:number;analysis_status:string;embedding_status:string;error_message:string;suite_id:string;suite_name:string;project_id:string;project_name:string;primary_asset_id:string;preview_key:string;score:number;active_visual_revision_id:string|null;visual_profile:VisualProfile|null;visual_summary:string|null;adaptation_notes:string};
export const materialMap:Record<string,string>={'主书封面':'BOOK_COVER','扉页':'TITLE_PAGE','礼盒':'GIFT_BOX','产品说明书':'PRODUCT_BOOKLET','挂图':'WALL_CHART'};
const fields=`a.*,s.name AS suite_name,s.primary_asset_id,p.id AS project_id,p.name AS project_name,vr.confirmed AS visual_profile,vr.summary AS visual_summary`;
const joins=`FROM assets a JOIN asset_embeddings e ON e.asset_id=a.id JOIN visual_suites s ON s.id=a.suite_id JOIN projects p ON p.id=s.project_id JOIN assets main ON main.id=s.primary_asset_id LEFT JOIN visual_revisions vr ON vr.id=e.visual_revision_id AND vr.id=a.active_visual_revision_id`;
const eligibility=`a.review_state='CONFIRMED' AND a.reuse_state<>'NOT_REUSABLE' AND a.embedding_status='READY' AND a.preview_key IS NOT NULL AND main.review_state='CONFIRMED' AND main.reuse_state<>'NOT_REUSABLE' AND main.embedding_status='READY' AND main.preview_key IS NOT NULL AND EXISTS(SELECT 1 FROM asset_embeddings main_e WHERE main_e.asset_id=main.id)`;
function mapAsset(row:Row):ArchiveAsset{return {id:row.id,filename:row.filename,displayName:row.display_name||row.filename,projectId:row.project_id,projectName:row.project_name,suiteId:row.suite_id,suiteName:row.suite_name,materialType:row.material_type,grade:row.grade,subject:row.subject,colors:row.colors??[],tags:row.tags??[],visualStyle:row.visual_style,layoutFeatures:row.layout_features,coreElements:row.core_elements??[],ocrText:row.ocr_text,description:row.visual_summary||row.description,reviewState:row.review_state,reuseState:row.reuse_state,confidence:row.confidence,analysisStatus:row.analysis_status,embeddingStatus:row.embedding_status,errorMessage:row.error_message,isPrimary:row.primary_asset_id===row.id,previewUrl:row.preview_key?`/api/assets/${row.id}/preview`:null,visualRevisionId:row.active_visual_revision_id,visualProfile:row.visual_profile,adaptationNotes:row.adaptation_notes};}
async function textEmbedding(content:string){
 const base=process.env.EMBEDDING_SERVICE_URL?.trim().replace(/\/$/,'');if(!base)throw new Error('向量服务未配置');
 let response:Response;try{response=await fetch(`${base}/embed`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'text',content}),signal:AbortSignal.timeout(120000),cache:'no-store'});}catch(error){throw new Error(error instanceof Error&&['TimeoutError','AbortError'].includes(error.name)?'向量检索超时，请稍后重试':'无法连接向量服务，请检查 Docker embedding 服务后重试');}
 if(!response.ok)throw new Error(`向量服务不可用（${response.status}）`);
 const data=await response.json().catch(()=>null);if(data?.dimensions!==1024||!Array.isArray(data.embedding)||data.embedding.length!==1024||!data.embedding.every((value:unknown)=>typeof value==='number'&&Number.isFinite(value)))throw new Error('向量服务响应无效');return data.embedding as number[];
}
export async function vectorStatus(){try{const count=Number((await query<{count:string}>(`SELECT count(*)::text AS count ${joins} WHERE ${eligibility}`)).rows[0].count);const service=await fetch(`${process.env.EMBEDDING_SERVICE_URL?.replace(/\/$/,'')}/health`,{signal:AbortSignal.timeout(3000),cache:'no-store'});return {ready:service.ok&&count>0,indexedAssets:count,reason:service.ok?'没有可检索素材，请确认主参考、复用要求及向量状态':'向量服务未就绪'};}catch{return {ready:false,indexedAssets:0,reason:'无法检查正式索引，请检查 PostgreSQL 和 embedding 服务后重试'};}}
export async function retrievalAvailability(analysis:BriefAnalysis){const a=scopeBriefConstraints(analysis);return `当前素材库没有匹配「${a.materialType}／${a.grade}／${a.subject}」${a.hardConstraints.length?`和参考筛选「${a.hardConstraints.map(constraintLabel).join('、')}」`:''}的套系。可使用独立上传或无参考创作；标题、卖点条数等成图要求不限制素材检索。`;}
export async function retrieveVectorCandidateSuites(analysis:BriefAnalysis,options:{excludeMaterialType?:string}={}):Promise<CandidateSuite[]>{
 analysis=scopeBriefConstraints(analysis);
 if(analysis.unsupportedConstraints?.length)throw new Error(`以下硬约束暂不能自动验证：${analysis.unsupportedConstraints.join('、')}。请补充为可验证的视觉分类，或明确改为偏好后重新确认。`);
 const vector=await textEmbedding([analysis.designDirection,...analysis.designKeywords,analysis.searchQuery].join(' '));
 const values:unknown[]=[`[${vector}]`];const conditions=[eligibility];
 const add=(value:unknown)=>{values.push(value);return `$${values.length}`;};
 if(materialMap[analysis.materialType])conditions.push(`a.material_type=${add(materialMap[analysis.materialType])}`);
 if(options.excludeMaterialType)conditions.push(`a.material_type<>${add(options.excludeMaterialType)}`);
 if(analysis.grade==='小学')conditions.push(`(a.grade IN ('小学','全学段') OR a.grade ~ '[一二三四五六1-6]年级')`);
 else if(analysis.grade!=='未指定')conditions.push(`(a.grade=${add(analysis.grade)} OR a.grade='全学段')`);
 if(analysis.subject!=='未指定'){const ref=add(analysis.subject);conditions.push(`(a.subject=${ref} OR a.subject IN ('语数英','全科','全学科') OR a.subject ILIKE '%'||${ref}||'%')`);}
 for(const rule of analysis.hardConstraints??[]){
  const group=add(rule.field.split('.')[0]);const value=add(rule.value);
  conditions.push(`vr.confirmed IS NOT NULL AND vr.confirmed->${group}::text->>'status' IN ('OBSERVED','ABSENT')`);
  if(rule.field==='selling.count')conditions.push(`(vr.confirmed->${group}::text->>'status'='ABSENT' OR vr.confirmed->${group}::text->>'count' ~ '^[0-9]+$')`);
  const test=rule.field==='selling.count'?`vr.confirmed->${group}::text->>'count'=${value}`:`(vr.confirmed->${group}::text->'types') ? ${value}`;
  conditions.push(rule.operator==='include'?`(${test})`:`NOT (${test})`);
 }
 const where=conditions.join(' AND ');const limit=240;
 const hits=await transaction(async client=>{
  await client.query("SET LOCAL hnsw.iterative_scan='strict_order'");await client.query('SET LOCAL hnsw.max_scan_tuples=20000');
  const recalled=await client.query<{asset_id:string}>(`WITH eligible AS MATERIALIZED(SELECT a.id ${joins} WHERE ${where}),text_hits AS MATERIALIZED(SELECT e.asset_id FROM asset_embeddings e WHERE e.asset_id IN(SELECT id FROM eligible) ORDER BY e.text_embedding <=> $1::vector LIMIT ${limit}),image_hits AS MATERIALIZED(SELECT e.asset_id FROM asset_embeddings e WHERE e.asset_id IN(SELECT id FROM eligible) ORDER BY e.image_embedding <=> $1::vector LIMIT ${limit}) SELECT asset_id FROM text_hits UNION SELECT asset_id FROM image_hits`,values);
  let ids=recalled.rows.map(row=>row.asset_id);
  if(ids.length<limit){const exact=await client.query<{id:string}>(`WITH eligible AS MATERIALIZED(SELECT a.id,e.text_embedding,e.image_embedding ${joins} WHERE ${where}) SELECT id FROM eligible ORDER BY .6*(text_embedding <=> $1::vector)+.4*(image_embedding <=> $1::vector) LIMIT ${limit}`,values);ids=[...new Set([...ids,...exact.rows.map(row=>row.id)])];}
  if(!ids.length)return [];
  return (await client.query<Row>(`SELECT ${fields},1-(.6*(e.text_embedding <=> $1::vector)+.4*(e.image_embedding <=> $1::vector)) AS score ${joins} WHERE a.id=ANY($2::uuid[])`,[values[0],ids])).rows;
 });
 const ranked=hits.map(row=>{const match=preferenceMatch(row.visual_profile,analysis.preferences);return {...row,score:match.matched.length+match.missed.length?row.score*.8+match.ratio*.2:row.score};}).sort((a,b)=>b.score-a.score);
 if(!ranked.length)return [];
 const suites=[...new Set(ranked.map(row=>row.suite_id))];
 const eligible=(await query<Row>(`SELECT ${fields},0 AS score ${joins} WHERE ${eligibility} AND a.suite_id=ANY($1::uuid[])`,[suites])).rows.filter(row=>matchesConstraints(row.visual_profile,analysis.hardConstraints??[]));
 return suites.map(suiteId=>{
  const suiteHits=ranked.filter(row=>row.suite_id===suiteId);const primary=eligible.find(row=>row.id===suiteHits[0].primary_asset_id);if(!primary)return null;
  const helpers=[...suiteHits,...eligible.filter(row=>row.suite_id===suiteId)].filter(row=>row.id!==primary.id&&(!options.excludeMaterialType||row.material_type!==options.excludeMaterialType)&&matchesConstraints(row.visual_profile,analysis.hardConstraints??[])).filter((row,index,all)=>all.findIndex(item=>item.id===row.id)===index).slice(0,2);
  const match=preferenceMatch(suiteHits[0].visual_profile,analysis.preferences);
  return {suiteId,projectId:primary.project_id,projectName:primary.project_name,suiteName:primary.suite_name,score:Math.round(suiteHits[0].score*100),matchReasons:[`命中${analysis.materialType}物料`,...match.matched.map(value=>`匹配：${value}`),...match.missed.map(value=>`未匹配偏好：${value}`),primary.active_visual_revision_id?'视觉规则 v1':'旧版规则，仅语义参考'],primary:mapAsset(primary),helpers:helpers.map(mapAsset)};
 }).filter((value):value is CandidateSuite=>value!==null).slice(0,3);
}
