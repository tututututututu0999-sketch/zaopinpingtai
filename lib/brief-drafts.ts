import {query,transaction} from './db';
import {analyseBrief} from './gateway';
import type {BriefAnalysis} from './brief';
import {normalizeBriefConstraints} from '@/visual-rules/v1/index.mjs';
import {scopeBriefConstraints} from '@/visual-rules/constraint-scope.mjs';
import {requireTextModel} from './text-models';
type DraftRow={id:string;original_brief:string;latest_revision:number;analysis:BriefAnalysis;supplements:string[]};
export async function analyseDraft(input:{brief?:string;draftId?:string;revision?:number;supplement?:string;textModel?:string}){
 let previous:DraftRow|undefined;
 if(input.draftId){previous=(await query<DraftRow>(`SELECT d.*,r.analysis,r.supplements FROM brief_drafts d JOIN brief_revisions r ON r.draft_id=d.id AND r.revision=d.latest_revision WHERE d.id=$1`,[input.draftId])).rows[0];if(!previous||previous.latest_revision!==input.revision)throw new Error('需求版本已变化，请重新打开');if(!input.supplement?.trim())throw new Error('请输入补充说明');}
 const brief=previous?.original_brief||input.brief?.trim();if(!brief||brief.length>8000||(input.supplement?.length??0)>4000)throw new Error('请输入有效设计需求（最多8000字，补充最多4000字）');
 const supplements=previous?[...previous.supplements,input.supplement!.trim()]:[];
 const textModel=input.textModel??previous?.analysis.textModel;
 if(textModel)await requireTextModel(textModel);
 const result=await analyseBrief(brief,previous?{previous:previous.analysis,supplements}:undefined,textModel);
 return transaction(async client=>{
  let id=previous?.id;
  if(id){const locked=(await client.query('SELECT latest_revision FROM brief_drafts WHERE id=$1 FOR UPDATE',[id])).rows[0];if(locked.latest_revision!==input.revision)throw new Error('需求已由另一操作更新，请刷新');}
  else id=(await client.query('INSERT INTO brief_drafts(original_brief) VALUES($1) RETURNING id',[brief])).rows[0].id;
  const revision=(previous?.latest_revision??0)+1;
  const analysis=scopeBriefConstraints(normalizeBriefConstraints({...result,draftId:id,revision,supplements}));
  await client.query('INSERT INTO brief_revisions(draft_id,revision,supplements,analysis) VALUES($1,$2,$3::jsonb,$4::jsonb)',[id,revision,JSON.stringify(supplements),JSON.stringify(analysis)]);
  await client.query('UPDATE brief_drafts SET latest_revision=$2 WHERE id=$1',[id,revision]);
  return analysis;
 });
}
export async function confirmBrief(draftId:string,revision:number){return transaction(async client=>{
 const row=(await client.query('SELECT latest_revision FROM brief_drafts WHERE id=$1 FOR UPDATE',[draftId])).rows[0];
 if(!row||row.latest_revision!==revision)throw new Error('只能确认最新需求版本');
 const result=(await client.query('UPDATE brief_revisions SET confirmed_at=now() WHERE draft_id=$1 AND revision=$2 RETURNING analysis,supplements',[draftId,revision])).rows[0];return scopeBriefConstraints(normalizeBriefConstraints({...result.analysis as BriefAnalysis,supplements:result.supplements}));
});}
export async function getConfirmedBrief(draftId:string,revision:number){
 const result=await query<{analysis:BriefAnalysis;supplements:string[]}>(`SELECT r.analysis,r.supplements FROM brief_revisions r JOIN brief_drafts d ON d.id=r.draft_id WHERE r.draft_id=$1 AND r.revision=$2 AND d.latest_revision=r.revision AND r.confirmed_at IS NOT NULL`,[draftId,revision]);
 if(!result.rows[0])throw new Error('需求尚未确认或版本已过期，请确认最新设计方向');
 return scopeBriefConstraints(normalizeBriefConstraints({...result.rows[0].analysis,supplements:result.rows[0].supplements}));
}
