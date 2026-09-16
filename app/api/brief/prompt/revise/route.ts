import {contextReferencePlan} from '@/lib/reference-plan';
import { reviseImagePrompt } from "@/lib/gateway";
import { NextResponse } from "next/server";
import {taskContext} from '@/lib/design-tasks';
import {assembleImage2Prompt,normalizeImageSize,normalizeCreativity,GENERATION_RULE_VERSION} from '@/visual-rules/generation.mjs';
import {query} from '@/lib/db';
import type {PromptDraft} from '@/lib/brief';
import {assertReferenceRevision} from '@/lib/task-references';
import {generationContext} from '@/lib/generation-context';
import {editReferences} from '@/lib/edit-references';
import {editReferenceRoles} from '@/visual-rules/reference-roles.mjs';

export async function POST(request: Request) {
  try {
    const body=await request.json();const context=await taskContext(body.taskId);
    if((!context.prompt&&!body.baseVersionId)||!body.instruction?.trim())throw new Error('缺少提示词或修改意见');
    let current=context.prompt!;
    let baseSize:string|undefined;
    if(body.baseVersionId){
      const version=(await query<{prompt:PromptDraft;size:string}>('SELECT prompt,size FROM design_versions WHERE id=$1 AND task_id=$2 AND output_key IS NOT NULL',[body.baseVersionId,body.taskId])).rows[0];
      if(!version)throw new Error('改图底图必须是当前任务已生成的历史版本');
      const legacy=version.prompt.prompt.match(/【生图提示词】\s*([\s\S]*?)\s*【反向提示词】/);
      current={...version.prompt,prompt:legacy?legacy[1]:version.prompt.prompt};
      baseSize=version.size;
    }
    const creativity=normalizeCreativity(body.creativity??current.creativity);
    if(body.mode==='direct'){
      if(!body.baseVersionId)throw new Error('直接改图需要先选择一个已生成版本');
      if(Array.from(body.instruction.trim()).length>300)throw new Error('局部修改请控制在300字以内，复杂修改可选 Terra 重组');
      const size=normalizeImageSize(baseSize);
      const editRefs=await editReferences(body.taskId,body.editReferenceIds);
      const draft:PromptDraft={prompt:body.instruction.trim(),editInstruction:body.instruction.trim(),negativePrompt:'',source:'terra',revisionMode:'direct',size,referencePlan:current.referencePlan,creativity,referenceRoles:['图1：所选改图底图，仅按本次意见修改'],referenceNotes:[],editBaseVersionId:body.baseVersionId,rewriteContext:current.rewriteContext??{prompt:current.prompt,negativePrompt:current.negativePrompt},generationRuleVersion:GENERATION_RULE_VERSION};
      draft.editReferenceIds=editRefs.map(ref=>ref.id);draft.editReferenceSnapshot=editRefs;
      draft.referenceRoles=editReferenceRoles(editRefs);
      draft.compiledPrompt=assembleImage2Prompt({draft,analysis:context.analysis,size,referenceRoles:draft.referenceRoles});
      await assertReferenceRevision(body.taskId,context.reference_revision);
      return NextResponse.json({...draft,referenceRevision:context.reference_revision});
    }
    if(body.editReferenceIds?.length)throw new Error('本次专用参考图请使用直接改图；整体重组请在项目参考区添加');
    const referencePlan=contextReferencePlan(context,{...(body.sellingSourceId||body.sellingType!==undefined?{sellingSourceId:body.sellingSourceId,sellingType:body.sellingType}:current.referencePlan),creativity});
    const size=normalizeImageSize(body.size);
    const assembly=await generationContext(body.taskId,context,referencePlan,creativity,body.baseVersionId);
    // Reconstruct only the selected version's ancestry, not edits on other
    // branches. This history goes to the text model, never into direct edits.
    const previousImageEdits=body.baseVersionId&&current.editInstruction?(await query<{instruction:string}>(`
      WITH RECURSIVE lineage AS (
        SELECT id,prompt,0 AS depth,ARRAY[id] AS path FROM design_versions WHERE id=$1 AND task_id=$2
        UNION ALL
        SELECT parent.id,parent.prompt,child.depth+1,child.path||parent.id
        FROM lineage child JOIN design_versions parent ON parent.id::text=child.prompt->>'editBaseVersionId'
        WHERE parent.task_id=$2 AND child.prompt->>'revisionMode'='direct'
          AND jsonb_typeof(child.prompt->'editInstruction')='string' AND NOT parent.id=ANY(child.path)
      ) SELECT prompt->>'editInstruction' AS instruction FROM lineage
        WHERE prompt->>'revisionMode'='direct' AND jsonb_typeof(prompt->'editInstruction')='string' ORDER BY depth DESC
    `,[body.baseVersionId,body.taskId])).rows.map(row=>row.instruction):[];
    const revised=await reviseImagePrompt({analysis:context.analysis,current,previousImageEdits,instruction:body.instruction.trim(),size,referencePlan,creativity,...assembly});
    await assertReferenceRevision(body.taskId,context.reference_revision);
    return NextResponse.json({...revised,referenceRevision:context.reference_revision,revisionMode:'terra',...(body.baseVersionId?{editBaseVersionId:body.baseVersionId}:{})});
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "重新生成提示词失败" }, { status: 502 }); }
}
