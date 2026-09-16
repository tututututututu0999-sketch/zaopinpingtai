import { updateDesignTask,confirmGeneratedReference,changeTaskModel } from "@/lib/design-tasks";
import { query } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    const task = await query<{ id: string; parent_task_id: string | null; brief: string; analysis: unknown; report: unknown; prompt: unknown; status: string; generation_key: string | null; generation_error: string | null }>(`SELECT id,parent_task_id,brief,analysis,report,prompt,status,generation_key,generation_error,reference_ids,reference_source,reference_revision,text_model FROM design_tasks WHERE id=$1`, [id]);
    if (!task.rows[0]) return NextResponse.json({ error: "设计任务不存在" }, { status: 404 });
    const versions = await query<{ id: string; prompt: unknown; size: string; model_name: string | null; output_key: string | null; error_message: string | null; created_at: string }>(`SELECT id,prompt,size,model_name,output_key,error_message,created_at FROM design_versions WHERE task_id=$1 AND output_key IS NOT NULL AND error_message IS NULL ORDER BY created_at DESC`, [id]);
    return NextResponse.json({ ...task.rows[0], versions: versions.rows.map((version) => ({ ...version, imageUrl: version.output_key ? `/api/generated/versions/${version.id}` : null })) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "读取设计任务失败" }, { status: 503 }); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const body=await request.json();const id=(await params).id;return NextResponse.json(body.action==='text-model'?await changeTaskModel(id,body.model):body.action==='confirm-reference'?await confirmGeneratedReference(id,body.versionId):await updateDesignTask(id,body)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "更新任务失败" }, { status: 409 }); }
}
