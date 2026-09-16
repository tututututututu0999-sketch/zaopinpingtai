import { query, transaction } from "./db";
import {getConfirmedBrief} from './brief-drafts';
import type {BriefAnalysis,ReferenceReport,PromptDraft} from './brief';
import {matchesConstraints,type VisualProfile} from '@/visual-rules/v1/index.mjs';
import {taskReferenceRows,referenceInstruction,type StoredReference} from './task-references';
import {getObject} from './storage';
import {analyseReferenceImage} from './gateway';
import {requireTextModel} from './text-models';
import {constraintLabel,referenceConstraintsForRole} from '@/visual-rules/constraint-scope.mjs';

type StoredAnalysis = { source?: unknown };
export async function taskContext(id:string){
 const task=(await query<{reference_source:'catalog'|'upload'|'none';reference_revision:number;upload_reference_snapshot:(StoredReference&{profile:VisualProfile})[];analysis:BriefAnalysis;brief_draft_id:string|null;brief_revision:number;reference_ids:string[];reference_snapshot:{id:string;description:string;profile:VisualProfile|null;adaptation_notes:string;visual_revision_id:string|null;preview_key:string}[];report:ReferenceReport;prompt:PromptDraft}>(`SELECT * FROM design_tasks WHERE id=$1`,[id])).rows[0];
 if(!task)throw new Error('设计任务不存在');
 const selected=(task as typeof task&{text_model:string|null}).text_model;
 if(selected)task.analysis={...task.analysis,textModel:selected};
 if(!task.brief_draft_id)throw new Error('旧任务保留历史，请按新版流程重新确认需求后继续创作');
 task.analysis={...await getConfirmedBrief(task.brief_draft_id,task.brief_revision),...(selected?{textModel:selected}:task.analysis.textModel?{textModel:task.analysis.textModel}:{})};
 if(task.reference_source==='none'){
  if(task.reference_ids.length||(await taskReferenceRows(id)).length)throw new Error('无参考任务存在不一致的参考记录');
  return {...task,primaryDescription:'无上传或套系参考。依据本次需求自主设计，不声称看过参考图片；延展任务仅继承已确认父主视觉。',helperDescriptions:[] as string[]};
 }
 if(task.reference_source==='upload'){
  const refs=await taskReferenceRows(id),snapshot=task.upload_reference_snapshot;
  if(!snapshot.length||refs.length!==snapshot.length||snapshot.some(ref=>!refs.some(current=>current.id===ref.id&&current.note===ref.note&&current.role===ref.role&&current.object_key===ref.object_key)))throw new Error('上传参考尚未确认或已修改，请重新确认上传参考');
  const descriptions=snapshot.map(ref=>JSON.stringify({role:ref.role,instruction:referenceInstruction(ref),profile:ref.profile}));
  return {...task,primaryDescription:descriptions[0],helperDescriptions:descriptions.slice(1)};
 }
 const eligible=(await query<{id:string;reuse_state:string;adaptation_notes:string}>(`SELECT a.id,a.reuse_state,a.adaptation_notes FROM assets a JOIN visual_suites s ON s.id=a.suite_id JOIN assets p ON p.id=s.primary_asset_id WHERE a.id=ANY($1::uuid[]) AND a.review_state='CONFIRMED' AND a.reuse_state<>'NOT_REUSABLE' AND a.embedding_status='READY' AND p.review_state='CONFIRMED' AND p.reuse_state<>'NOT_REUSABLE' AND p.embedding_status='READY'`,[task.reference_ids])).rows;
 if(eligible.length!==task.reference_ids.length)throw new Error('参考素材审核或复用资格已变化，请重新确认参考');
 if(!task.reference_snapshot?.length||task.reference_snapshot.some(row=>!matchesConstraints(row.profile,task.analysis.hardConstraints)))throw new Error('参考快照不满足硬约束');
 const descriptions=task.reference_snapshot.map(row=>`${row.profile?JSON.stringify(row.profile):row.description}\n必须改造：${row.adaptation_notes||'不得复制品牌、原文案和未获授权角色'}`);
 return {...task,primaryDescription:descriptions[0],helperDescriptions:descriptions.slice(1)};
}
type StoredReport = { source?: unknown };
export async function confirmUploadedReferences(taskId:string){
 const task=(await query<{reference_source:string;reference_revision:number;brief_draft_id:string;brief_revision:number;status:string;text_model:string|null;analysis:BriefAnalysis}>('SELECT * FROM design_tasks WHERE id=$1',[taskId])).rows[0];
 if(!task||task.reference_source!=='upload')throw new Error('这不是独立上传任务');
 const analysis=await getConfirmedBrief(task.brief_draft_id,task.brief_revision);
 const selected=task.text_model??task.analysis.textModel??analysis.textModel;
 if(task.status!=='REFERENCE_PENDING')return taskContext(taskId);
 const refs=await taskReferenceRows(taskId);if(!refs.length)throw new Error('请先上传至少一张参考图');
 const snapshot:(StoredReference&{profile:VisualProfile})[]=[];
 for(const ref of refs){
  const profile=await analyseReferenceImage({filename:ref.filename,mimeType:ref.mime_type,content:await getObject(ref.object_key)},selected);
  const unmet=referenceConstraintsForRole(analysis.hardConstraints,ref.role).filter(rule=>!matchesConstraints(profile,[rule]));
  if(unmet.length)throw new Error(`参考图「${ref.filename}」未满足你明确指定的参考筛选：${unmet.map(rule=>`${constraintLabel(rule)}（原文：${rule.evidence}）`).join('；')}。最终成图要求不用于拒绝参考图。`);
  snapshot.push({...ref,profile});
 }
 return transaction(async client=>{
  const current=(await client.query('SELECT status,reference_revision FROM design_tasks WHERE id=$1 FOR UPDATE',[taskId])).rows[0];
  const brief=(await client.query('SELECT latest_revision FROM brief_drafts WHERE id=$1 FOR UPDATE',[task.brief_draft_id])).rows[0];
  if(current.reference_revision!==task.reference_revision||current.status!=='REFERENCE_PENDING'||brief.latest_revision!==task.brief_revision)throw new Error('识别期间参考或需求已变化，请重新确认');
  await client.query("UPDATE design_tasks SET upload_reference_snapshot=$2::jsonb,status='REFERENCE_CONFIRMED',updated_at=now() WHERE id=$1",[taskId,JSON.stringify(snapshot)]);
  return {id:taskId,status:'REFERENCE_CONFIRMED'};
 });
}
export async function changeTaskModel(id:string,value:unknown){
 const model=await requireTextModel(value);
 return transaction(async client=>{
  const task=(await client.query('SELECT * FROM design_tasks WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!task||task.status==='GENERATING')throw new Error('任务不存在或正在生图，暂不能切换模型');
  if((task.text_model??task.analysis?.textModel)===model)return {id,text_model:model,reference_revision:task.reference_revision,status:task.status};
  const status=task.reference_source==='upload'&&!task.upload_reference_snapshot.length?'REFERENCE_PENDING':'REFERENCE_CONFIRMED';
  return (await client.query(`UPDATE design_tasks SET text_model=$2,reference_revision=reference_revision+1,report=NULL,prompt=NULL,status=$3,updated_at=now() WHERE id=$1 RETURNING id,text_model,reference_revision,status`,[id,model,status])).rows[0];
 });
}
type StoredPrompt = { source?: unknown; prompt?: unknown; negativePrompt?: unknown };

function isLunaAnalysis(value: unknown): value is StoredAnalysis { return typeof value === "object" && value !== null && (value as StoredAnalysis).source === "luna"; }
function isTerraReport(value: unknown): value is StoredReport { return typeof value === "object" && value !== null && (value as StoredReport).source === "terra"; }
function isTerraPrompt(value: unknown): value is StoredPrompt {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as StoredPrompt;
  return draft.source === "terra" && typeof draft.prompt === "string" && Boolean(draft.prompt.trim()) && typeof draft.negativePrompt === "string";
}

export async function createDesignTask(input: { brief: string; analysis: unknown; referenceAssetIds: string[]; parentTaskId?: string;draftId?:string;revision?:number;referenceSource?:'catalog'|'upload'|'none';textModel?:string }) {
  if(!input.draftId||!input.revision)throw new Error('请确认最新需求方向后创建设计');
  const analysis=await getConfirmedBrief(input.draftId,input.revision);
  if(input.textModel)analysis.textModel=await requireTextModel(input.textModel);
  if(input.referenceSource!=='none'&&analysis.unsupportedConstraints.length)throw new Error(`参考筛选暂不能验证：${analysis.unsupportedConstraints.join('；')}。可以明确修正筛选要求，或选择无参考创作。`);
  input.analysis=analysis;
  if (!isLunaAnalysis(input.analysis)) throw new Error("设计任务只能使用 Luna 的真实需求分析结果");
  const referenceIds = [...new Set(input.referenceAssetIds)];
  if(input.referenceSource&&input.referenceSource!=='catalog'&&referenceIds.length)throw new Error('此分支不接受套系素材');
  if ((!input.referenceSource||input.referenceSource==='catalog')&&(referenceIds.length < 1 || referenceIds.length > 3)) throw new Error("参考图必须为 1 张主图加最多 2 张辅助图");
  return transaction(async (client) => {
    const draft=(await client.query('SELECT latest_revision FROM brief_drafts WHERE id=$1 FOR UPDATE',[input.draftId])).rows[0];
    if(draft.latest_revision!==input.revision)throw new Error('需求已变化，请重新确认');
    if (input.parentTaskId) {
      const parent = await client.query<{ id: string }>(`SELECT id FROM design_tasks WHERE id=$1 AND status='GENERATED'`, [input.parentTaskId]);
      if (!parent.rows[0]) throw new Error("延展物料需要一个已生成的主视觉任务");
    }
    if(input.referenceSource==='upload'||input.referenceSource==='none')return (await client.query<{id:string;status:string}>(`INSERT INTO design_tasks(parent_task_id,brief,analysis,reference_ids,status,brief_draft_id,brief_revision,reference_snapshot,reference_source) VALUES($1,$2,$3::jsonb,'{}',$6,$4,$5,'[]',$7) RETURNING id,status`,[input.parentTaskId??null,analysis.originalBrief,JSON.stringify(analysis),input.draftId,input.revision,input.referenceSource==='none'?'REFERENCE_CONFIRMED':'REFERENCE_PENDING',input.referenceSource])).rows[0];
    const verified = await client.query<{ id: string; suite_id: string; primary_asset_id: string;profile:VisualProfile|null;description:string;adaptation_notes:string;visual_revision_id:string|null;preview_key:string;reuse_state:string }>(
      `SELECT a.id, a.suite_id, s.primary_asset_id,r.confirmed AS profile,COALESCE(r.summary,a.description) AS description,a.adaptation_notes,e.visual_revision_id,a.preview_key,a.reuse_state FROM assets a
       JOIN asset_embeddings e ON e.asset_id=a.id LEFT JOIN visual_revisions r ON r.id=e.visual_revision_id AND r.id=a.active_visual_revision_id
       JOIN visual_suites s ON s.id=a.suite_id
       JOIN assets primary_asset ON primary_asset.id=s.primary_asset_id
       WHERE a.id = ANY($1::uuid[]) AND a.review_state='CONFIRMED' AND a.reuse_state <> 'NOT_REUSABLE' AND a.embedding_status='READY'
         AND primary_asset.review_state='CONFIRMED' AND primary_asset.reuse_state <> 'NOT_REUSABLE' AND primary_asset.embedding_status='READY'`, [referenceIds],
    );
    if (verified.rows.length !== referenceIds.length) throw new Error("参考图必须全部已确认、非不可复用且已完成向量化");
    if(verified.rows.some(row=>!matchesConstraints(row.profile,analysis.hardConstraints)))throw new Error('参考图不满足已确认硬约束');

    const suiteId = verified.rows[0].suite_id;
    if (verified.rows.some((asset) => asset.suite_id !== suiteId)) throw new Error("主参考和辅助参考必须属于同一视觉套系");
    if (!referenceIds.includes(verified.rows[0].primary_asset_id)) throw new Error("参考组合必须包含该套系的已确认主参考图");
    const snapshot=referenceIds.map(id=>verified.rows.find(row=>row.id===id));
    const result = await client.query<{ id: string; status: string }>(`INSERT INTO design_tasks (parent_task_id, brief, analysis, reference_ids, status,brief_draft_id,brief_revision,reference_snapshot) VALUES ($1,$2,$3::jsonb,$4::uuid[],'REFERENCE_CONFIRMED',$5,$6,$7::jsonb) RETURNING id,status`, [input.parentTaskId ?? null, analysis.originalBrief, JSON.stringify(analysis), referenceIds,input.draftId,input.revision,JSON.stringify(snapshot)]);
    return result.rows[0];
  });
}

export async function updateDesignTask(id: string, input: { report?: unknown; prompt?: unknown; status?: string }) {
  await taskContext(id);
  return transaction(async (client) => {
    const existing = await client.query<{ status: string;reference_revision:number }>(`SELECT status,reference_revision FROM design_tasks WHERE id=$1 FOR UPDATE`, [id]);
    if (!existing.rows[0]) throw new Error("设计任务不存在");
    const submitted=(input.prompt??input.report) as {referenceRevision?:number}|undefined;
    if(submitted&&(submitted.referenceRevision??0)!==existing.rows[0].reference_revision)throw new Error('参考图版本已变化，请重新生成报告或提示词，旧结果未保存');
    const current=(await client.query(`SELECT d.latest_revision,t.brief_revision FROM design_tasks t JOIN brief_drafts d ON d.id=t.brief_draft_id WHERE t.id=$1 FOR UPDATE OF d`,[id])).rows[0];
    if(!current||current.latest_revision!==current.brief_revision)throw new Error('需求版本已变化，请重新确认参考');
    const transition = `${existing.rows[0].status}->${input.status ?? ""}`;
    if (["REFERENCE_CONFIRMED->REPORT_READY","REPORT_READY->REPORT_READY"].includes(transition) && isTerraReport(input.report)) {
      const result = await client.query<{ id: string; status: string }>(`UPDATE design_tasks SET report=$2::jsonb,status='REPORT_READY',updated_at=NOW() WHERE id=$1 RETURNING id,status`, [id, JSON.stringify(input.report)]);
      return result.rows[0];
    }
    if (transition === "REPORT_READY->PROMPT_DRAFT" && isTerraPrompt(input.prompt)) {
      const result = await client.query<{ id: string; status: string }>(`UPDATE design_tasks SET prompt=$2::jsonb,status='PROMPT_DRAFT',updated_at=NOW() WHERE id=$1 RETURNING id,status`, [id, JSON.stringify(input.prompt)]);
      return result.rows[0];
    }
    if (["PROMPT_CONFIRMED->PROMPT_DRAFT","PROMPT_DRAFT->PROMPT_DRAFT","GENERATED->PROMPT_DRAFT","GENERATION_FAILED->PROMPT_DRAFT"].includes(transition) && isTerraPrompt(input.prompt)) {
      const result = await client.query<{ id: string; status: string }>(`UPDATE design_tasks SET prompt=$2::jsonb,status='PROMPT_DRAFT',updated_at=NOW() WHERE id=$1 RETURNING id,status`, [id, JSON.stringify(input.prompt)]);
      return result.rows[0];
    }
    if (["PROMPT_DRAFT->PROMPT_CONFIRMED","GENERATED->PROMPT_CONFIRMED","GENERATION_FAILED->PROMPT_CONFIRMED","PROMPT_CONFIRMED->PROMPT_CONFIRMED"].includes(transition) && isTerraPrompt(input.prompt)) {
      const result = await client.query<{ id: string; status: string }>(`UPDATE design_tasks SET prompt=$2::jsonb,status='PROMPT_CONFIRMED',updated_at=NOW() WHERE id=$1 RETURNING id,status`, [id, JSON.stringify(input.prompt)]);
      return result.rows[0];
    }
    throw new Error("设计任务状态流转无效，必须按参考确认、Terra 报告、Terra 提示词、人工确认的顺序执行");
  });
}

export async function confirmGeneratedReference(taskId:string,versionId:string){
 await taskContext(taskId);
 return transaction(async client=>{
  const task=(await client.query('SELECT status FROM design_tasks WHERE id=$1 FOR UPDATE',[taskId])).rows[0];
  if(!task||task.status==='GENERATING')throw new Error('任务正在生成，请完成后再确认主视觉');
  const version=(await client.query<{output_key:string}>('SELECT output_key FROM design_versions WHERE id=$1 AND task_id=$2 AND output_key IS NOT NULL',[versionId,taskId])).rows[0];
  if(!version)throw new Error('请选择当前任务已成功生成的版本');
  await client.query("UPDATE design_tasks SET generation_key=$2,status='GENERATED',updated_at=NOW() WHERE id=$1",[taskId,version.output_key]);
  return {id:taskId,versionId,imageUrl:`/api/generated/versions/${versionId}`,status:'GENERATED'};
 });
}
