import { query,transaction } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { NextResponse } from "next/server";
import {invalidateTaskReferences} from '@/lib/task-references';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await query<{ object_key: string; mime_type: string }>(`SELECT object_key,mime_type FROM design_task_references WHERE id=$1`, [id]);
    const reference = result.rows[0];
    if (!reference) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(await getObject(reference.object_key), { headers: { "Content-Type": reference.mime_type, "Cache-Control": "private, max-age=3600" } });
  } catch { return new NextResponse("Not found", { status: 404 }); }
}

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const {id}=await params;
  await transaction(async client=>{
   const task=(await client.query("SELECT t.id FROM design_tasks t JOIN design_task_references r ON r.task_id=t.id WHERE r.id=$1 AND t.status IN ('REFERENCE_PENDING','REFERENCE_CONFIRMED','REPORT_READY','PROMPT_DRAFT','PROMPT_CONFIRMED','GENERATED','GENERATION_FAILED') FOR UPDATE OF t",[id])).rows[0];
   if(!task)throw new Error('参考不存在或任务正在生成，暂时不能移除');
   await client.query('DELETE FROM design_task_references WHERE id=$1',[id]);
   await invalidateTaskReferences(client,task.id);
  });
  // Original objects remain available to immutable generation history.
  return NextResponse.json({removed:true});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'移除失败'},{status:409});}
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const {id}=await params;const body=await request.json();
  if(typeof body.note!=='string'||body.note.length>180)return NextResponse.json({error:'使用说明必须在180字以内'},{status:400});
  await transaction(async client=>{
   const task=(await client.query("SELECT t.id FROM design_tasks t JOIN design_task_references r ON r.task_id=t.id WHERE r.id=$1 AND t.status IN ('REFERENCE_PENDING','REFERENCE_CONFIRMED','REPORT_READY','PROMPT_DRAFT','PROMPT_CONFIRMED','GENERATED','GENERATION_FAILED') FOR UPDATE OF t",[id])).rows[0];
   if(!task)throw new Error('参考不存在或任务正在生成，暂时不能修改');
   await client.query('UPDATE design_task_references SET note=$2 WHERE id=$1',[id,body.note.trim()]);
   await invalidateTaskReferences(client,task.id);
  });
  return NextResponse.json({id,note:body.note.trim()});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'说明保存失败'},{status:409});}
}
