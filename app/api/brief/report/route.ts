import { createReferenceReport } from "@/lib/gateway";
import { NextResponse } from "next/server";
import {taskContext} from '@/lib/design-tasks';
import {assertReferenceRevision} from '@/lib/task-references';

export async function POST(request: Request) {
  try {
    const {taskId}=await request.json();const input=await taskContext(taskId);
    if(input.reference_source==='none')return NextResponse.json({source:'terra',model:input.analysis.textModel,referenceRevision:input.reference_revision,summary:'根据已确认需求自主设计，不使用套系或上传参考。',reasons:['以本次文案和设计方向为依据'],reusableElements:['标题、卖点和主体遵循本次要求'],riskNotes:[]});
    const report=await createReferenceReport({ analysis: input.analysis, primaryDescription: input.primaryDescription, helperDescriptions: input.helperDescriptions ?? [] });
    await assertReferenceRevision(taskId,input.reference_revision);
    return NextResponse.json({...report,referenceRevision:input.reference_revision});
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "报告生成失败" }, { status: 502 });
  }
}
