import { query,transaction } from "@/lib/db";
import { putObject } from "@/lib/storage";
import { NextResponse } from "next/server";
import {invalidateTaskReferences} from '@/lib/task-references';
import {validReferenceRole,type ReferenceRole} from '@/lib/task-references';
import sharp from 'sharp';

export const runtime = "nodejs";

type ReferenceRow = { id: string; filename: string; mime_type: string; created_at: string;role:ReferenceRole;note:string };

function response(row: ReferenceRow) {
  return { id: row.id, filename: row.filename, mimeType: row.mime_type, createdAt: row.created_at,role:row.role,note:row.note, url: `/api/design-tasks/references/${row.id}` };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await query<ReferenceRow>(`SELECT id,filename,mime_type,created_at,role,note FROM design_task_references WHERE task_id=$1 ORDER BY created_at,id`, [id]);
    return NextResponse.json(result.rows.map(response));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "读取参考图失败" }, { status: 503 }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: taskId } = await params;
    const task = await query<{ id: string }>(`SELECT id FROM design_tasks WHERE id=$1 AND reference_source<>'none' AND status IN ('REFERENCE_PENDING','REFERENCE_CONFIRMED','REPORT_READY','PROMPT_DRAFT','PROMPT_CONFIRMED','GENERATED','GENERATION_FAILED')`, [taskId]);
    if (!task.rows[0]) return NextResponse.json({ error: "设计任务不存在，或当前状态不能添加参考图" }, { status: 409 });
    const form=await request.formData();const role=form.get('role')||'style',note=String(form.get('note')||'').trim();
    if(!validReferenceRole(role)||note.length>180)return NextResponse.json({error:'请选择参考用途，补充说明不超过180字'},{status:400});
    const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
    if (!files.length) return NextResponse.json({ error: "请选择图片" }, { status: 400 });
    if (files.length > 6) return NextResponse.json({ error: "每次最多上传 6 张参考图" }, { status: 400 });
    if(files.some(file=>!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024))return NextResponse.json({error:'请使用12MB以内的 PNG/JPEG/WebP 图片'},{status:400});
    const contents=await Promise.all(files.map(async file=>{
      const bytes=Buffer.from(await file.arrayBuffer());
      try{const meta=await sharp(bytes,{limitInputPixels:40_000_000}).metadata();
        if(!['png','jpeg','webp'].includes(meta.format||'')||`image/${meta.format}`!==file.type||(meta.pages??1)>1)throw new Error('format');
        await sharp(bytes,{limitInputPixels:40_000_000}).resize({width:64,height:64,fit:'inside'}).toBuffer();
      }catch{throw new Error(`「${file.name}」不是有效的静态图片，请换用 PNG/JPG/WebP`);}
      return bytes;
    }));
    const rows: ReferenceRow[] = await transaction(async client=>{
    const locked=await client.query("SELECT id FROM design_tasks WHERE id=$1 AND reference_source<>'none' AND status IN ('REFERENCE_PENDING','REFERENCE_CONFIRMED','REPORT_READY','PROMPT_DRAFT','PROMPT_CONFIRMED','GENERATED','GENERATION_FAILED') FOR UPDATE",[taskId]);
    if(!locked.rowCount)throw new Error('当前任务不可修改参考，请等待生成完成');
    const counts=(await client.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE role='character')::int AS characters FROM design_task_references WHERE task_id=$1",[taskId])).rows[0];
    if(counts.total+files.length>6)throw new Error('每个任务最多6张独立参考，请先移除不需要的图片');
    if(role==='character'&&counts.characters+files.length>1)throw new Error('请只选一张封面 IP 图，避免多个角色互相干扰；可先移除旧 IP');
    const added:ReferenceRow[]=[];
    for (const [index,file] of files.entries()) {
      const id = crypto.randomUUID(); const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "png";
      const key = `task-references/${taskId}/${id}.${extension}`;
      await putObject(key, contents[index], file.type);
      const inserted = await client.query<ReferenceRow>(`INSERT INTO design_task_references (id,task_id,object_key,filename,mime_type,role,note) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,filename,mime_type,created_at,role,note`, [id, taskId, key, file.name, file.type,role,note]);
      added.push(inserted.rows[0]);
    }
    await invalidateTaskReferences(client,taskId);
    return added;});
    return NextResponse.json(rows.map(response), { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "上传参考图失败" }, { status: 503 }); }
}
