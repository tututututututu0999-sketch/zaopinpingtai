import {referenceConstraintsForRole} from '@/visual-rules/constraint-scope.mjs';
import {contextReferencePlan} from '@/lib/reference-plan';
import { editImage, generateImage, verifyReferenceConstraints, type ImageReferenceInput } from "@/lib/gateway";
import {taskContext} from '@/lib/design-tasks';
import { query,transaction } from "@/lib/db";
import { getObject, putObject } from "@/lib/storage";
import { NextResponse } from "next/server";
import {normalizeImageSize,assembleImage2Prompt,GENERATION_RULE_VERSION} from '@/visual-rules/generation.mjs';
import type {PromptDraft} from '@/lib/brief';
import sharp from 'sharp';
import {taskReferenceRows} from '@/lib/task-references';
import {buildReferenceRoles,editReferenceRoles} from '@/visual-rules/reference-roles.mjs';
import {editReferences} from '@/lib/edit-references';
import {assertPromptCompatible} from '@/visual-rules/prompt-conflicts.mjs';
import {sellingExample} from '@/visual-rules/selling-examples.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

type TaskRow = {
  id: string; prompt: PromptDraft | null; reference_ids: string[];
  generation_key: string | null; parent_task_id: string | null; parent_generation_key: string | null;
};

function contentType(key: string) {
  const value = key.toLowerCase();
  if (value.endsWith(".webp")) return "image/webp";
  if (value.endsWith(".jpg") || value.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
}

async function imageBuffer(imageUrl: string) {
  if (imageUrl.startsWith("data:image/")) return Buffer.from(imageUrl.split(",", 2)[1], "base64");
  const response=await fetch(imageUrl,{signal:AbortSignal.timeout(60_000)});
  if(!response.ok)throw new Error(`生成图片下载失败（${response.status}），未保存为成功结果`);
  return Buffer.from(await response.arrayBuffer());
}

export async function POST(request: Request) {
  const input = await request.json().catch(()=>null);
  const taskId=input?.taskId;
  if (!taskId) return NextResponse.json({ error: "缺少设计任务" }, { status: 400 });
  let size:string;
  try {size=normalizeImageSize(input.size);} catch(error) {return NextResponse.json({error:error instanceof Error?error.message:'画幅无效'},{status:400});}
  let versionId: string | undefined;
  let taskClaimed=false;
  try {
    const context=await taskContext(taskId);
    const claimed = await query<TaskRow>(
      `UPDATE design_tasks task SET status='GENERATING', generation_error=NULL, updated_at=NOW()
       FROM design_tasks parent WHERE task.id=$1 AND task.status='PROMPT_CONFIRMED' AND task.reference_revision=$2 AND parent.id=task.parent_task_id
       RETURNING task.id,task.prompt,task.reference_ids,task.generation_key,task.parent_task_id,parent.generation_key AS parent_generation_key`, [taskId,context.reference_revision],
    );
    const row = claimed.rows[0] ?? (await query<TaskRow>(
      `UPDATE design_tasks SET status='GENERATING', generation_error=NULL, updated_at=NOW()
       WHERE id=$1 AND status='PROMPT_CONFIRMED' AND reference_revision=$2
       RETURNING id,prompt,reference_ids,generation_key,parent_task_id,NULL::text AS parent_generation_key`, [taskId,context.reference_revision],
    )).rows[0];
    if (!row) return NextResponse.json({ error: "设计任务不存在，或提示词尚未确认" }, { status: 409 });
    taskClaimed=true;
    const draft = row.prompt;
    if((draft?.referenceRevision??0)!==context.reference_revision)throw new Error('提示词的参考版本已过期，请重新组合');
    if (!draft?.prompt?.trim()) throw new Error("已确认任务缺少可追溯的提示词");
    if(draft.size&&normalizeImageSize(draft.size)!==size)throw new Error('画幅已变化，请按新尺寸重新组合提示词后生图');
    const direct=draft.revisionMode==='direct'&&typeof draft.editInstruction==='string';
    if(direct&&!draft.editBaseVersionId)throw new Error('直接改图需要先选择一个已生成版本');
    const referencePlan=direct?draft.referencePlan:contextReferencePlan(context,{...draft.referencePlan,creativity:draft.creativity});
    let baseKey:string|null=null;
    if(draft.editBaseVersionId){
      const base=(await query<{output_key:string;size:string}>('SELECT output_key,size FROM design_versions WHERE id=$1 AND task_id=$2 AND output_key IS NOT NULL',[draft.editBaseVersionId,taskId])).rows[0];
      baseKey=base?.output_key;
      if(!baseKey)throw new Error('改图底图不存在或不属于当前任务，请重新选择历史版本');
      if(direct&&normalizeImageSize(base.size)!==size)throw new Error('直接改图沿用所选底图尺寸；改变画幅请使用重组提示词');
    }
    const assetKeys={rows:direct?[]:context.reference_snapshot.map(item=>({id:item.id,preview_key:item.preview_key,filename:`reference-${item.id}.jpg`}))};
    const savedReferences=await taskReferenceRows(taskId);
    const taskReferences = {rows:direct?await editReferences(taskId,draft.editReferenceIds):savedReferences};
    if(!direct)assertPromptCompatible(draft,{uploadedReferences:taskReferences.rows,referencePlan});
    const example=direct?null:sellingExample(referencePlan?.sellingType??'');
    const exampleBytes=example?await readFile(`${process.cwd()}/public${example.path}`):null;
    const exampleKey=exampleBytes?`rule-examples/${createHash('sha256').update(exampleBytes).digest('hex')}.png`:null;
    const baseSource=baseKey||row.parent_generation_key;
    const sourceKeys = [baseSource,...assetKeys.rows.map(asset=>asset.preview_key),...taskReferences.rows.map(reference=>reference.object_key)].filter((key):key is string=>Boolean(key));
    const referenceRoles=direct?editReferenceRoles(taskReferences.rows):buildReferenceRoles({references:assetKeys.rows,uploads:taskReferences.rows,baseKind:baseSource?(baseKey?'edit':'parent'):undefined,referencePlan,creativity:draft.creativity});
    if(exampleKey)sourceKeys.push(exampleKey);
    const prompt=assembleImage2Prompt({draft:{...draft,referencePlan},analysis:context.analysis,size,referenceRoles,referenceNotes:context.reference_snapshot.map(item=>item.adaptation_notes)});
    const references: ImageReferenceInput[] = [
      ...(await Promise.all(assetKeys.rows.map(async (asset) => ({ filename: asset.filename, mimeType: contentType(asset.preview_key), content: await getObject(asset.preview_key) })))),
      ...(await Promise.all(taskReferences.rows.map(async (reference) => ({ filename: reference.filename, mimeType: reference.mime_type, content: await getObject(reference.object_key) })))),
    ];
    if(baseSource)references.unshift({filename:baseKey?'edit-base.png':'parent-visual.png',mimeType:contentType(baseSource),content:await getObject(baseSource)});
    if(exampleBytes&&exampleKey){await putObject(exampleKey,exampleBytes,'image/png');references.push({filename:`selling-example-${referencePlan?.sellingType}.png`,mimeType:'image/png',content:exampleBytes});}
    // Check only explicit reference restrictions, scoped to the input's purpose.
    // Confirmed upload snapshots were already checked; base images are outputs.
    if(!direct&&context.reference_source==='catalog')for(const ref of taskReferences.rows)await verifyReferenceConstraints({filename:ref.filename,mimeType:ref.mime_type,content:await getObject(ref.object_key)},referenceConstraintsForRole(context.analysis.hardConstraints,ref.role),context.analysis.textModel);
    await taskContext(taskId);
    versionId = crypto.randomUUID();
    const generated = references.length ? await editImage(prompt, references, size ?? "1024x1536") : await generateImage(prompt, size ?? "1024x1536");
    const raw = await imageBuffer(generated.imageUrl);
    if (!raw.length) throw new Error("生图服务返回空图片");
    const image=await sharp(raw).png().toBuffer();
    const key = `generated/${taskId}/${versionId}.png`; await putObject(key, image, "image/png");
    await transaction(async client=>{
    await client.query(`INSERT INTO design_versions (id,task_id,prompt,size,source_keys,model_name,output_key) VALUES ($1,$2,$3::jsonb,$4,$5::jsonb,$6,$7)`, [versionId, taskId, JSON.stringify({...draft,referencePlan,compiledPrompt:prompt,referenceRoles,uploadedReferenceSnapshot:savedReferences,uploadVisualSnapshot:context.upload_reference_snapshot,generationRuleVersion:GENERATION_RULE_VERSION,ruleVersion:context.analysis.ruleVersion,briefRevision:context.brief_revision,referenceSnapshot:context.reference_snapshot}), size, JSON.stringify(sourceKeys), process.env.IMAGE_MODEL ?? "gpt-image-2", key]);
    await client.query(`UPDATE design_tasks SET status='GENERATED', generation_model=$2, generation_key=$3, updated_at=NOW() WHERE id=$1`, [taskId, process.env.IMAGE_MODEL ?? "gpt-image-2", key]);
    });
    return NextResponse.json({ imageUrl: `/api/generated/versions/${versionId}`, versionId, usedImageReferences: references.length,size,generationRuleVersion:GENERATION_RULE_VERSION,referenceRoles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生图失败";
    if(taskClaimed)await query(`UPDATE design_tasks SET status='GENERATION_FAILED', generation_error=$2, updated_at=NOW() WHERE id=$1`, [taskId, message]).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
