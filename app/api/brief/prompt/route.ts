import {contextReferencePlan} from '@/lib/reference-plan';
import { composeImagePrompt } from "@/lib/gateway";
import { NextResponse } from "next/server";
import {taskContext} from '@/lib/design-tasks';
import {normalizeImageSize,normalizeCreativity} from '@/visual-rules/generation.mjs';
import {assertReferenceRevision} from '@/lib/task-references';
import {generationContext} from '@/lib/generation-context';

export async function POST(request: Request) {
  try {
    const {taskId,size,sellingSourceId,sellingType,creativity:requestedCreativity}=await request.json();const input=await taskContext(taskId);
    if(!input.report)throw new Error('请先生成并确认参考报告');
    const creativity=normalizeCreativity(requestedCreativity);
    const referencePlan=contextReferencePlan(input,{sellingSourceId,sellingType,creativity});
    const draft=await composeImagePrompt({ analysis: input.analysis, report: input.report, primaryDescription: input.primaryDescription, helperDescriptions: input.helperDescriptions ?? [],size:normalizeImageSize(size),referencePlan,creativity,...await generationContext(taskId,input,referencePlan,creativity) });
    await assertReferenceRevision(taskId,input.reference_revision);
    return NextResponse.json({...draft,referenceRevision:input.reference_revision});
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "提示词生成失败" }, { status: 502 });
  }
}
