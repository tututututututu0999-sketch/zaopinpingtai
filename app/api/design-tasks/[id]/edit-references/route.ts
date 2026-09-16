import {NextResponse} from 'next/server';
import {query} from '@/lib/db';
import {putObject,getObject} from '@/lib/storage';
import {validReferenceRole} from '@/lib/task-references';
import sharp from 'sharp';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const ref=new URL(request.url).searchParams.get('ref');
 const row=(await query<{object_key:string;mime_type:string}>('SELECT object_key,mime_type FROM image_edit_references WHERE task_id=$1 AND id::text=$2',[id,ref])).rows[0];
 if(!row)return new NextResponse('Not found',{status:404});
 return new NextResponse(await getObject(row.object_key),{headers:{'Content-Type':row.mime_type,'Cache-Control':'private, max-age=3600'}});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const {id:taskId}=await params;
  if(!(await query('SELECT id FROM design_tasks WHERE id=$1 AND status<>\'GENERATING\'',[taskId])).rowCount)throw new Error('任务不存在或正在生图');
  const form=await request.formData(),file=form.get('file'),role=form.get('role'),note=String(form.get('note')||'').trim();
  if(!(file instanceof File)||!file.size||file.size>12*1024*1024||!validReferenceRole(role)||note.length>180)throw new Error('请选择12MB以内图片、用途，并将说明限制在180字内');
  const bytes=Buffer.from(await file.arrayBuffer());const metadata=await sharp(bytes,{limitInputPixels:40_000_000}).metadata();
  if(!['png','jpeg','webp'].includes(metadata.format||'')||(metadata.pages??1)>1)throw new Error('仅支持静态PNG/JPEG/WebP图片');
  const content=await sharp(bytes,{limitInputPixels:40_000_000}).rotate().png().toBuffer();
  const id=crypto.randomUUID(),key=`edit-references/${taskId}/${id}.png`;
  await putObject(key,content,'image/png');
  await query('INSERT INTO image_edit_references(id,task_id,object_key,filename,mime_type,role,note) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,taskId,key,file.name,'image/png',role,note]);
  return NextResponse.json({id,filename:file.name,role,note,url:`/api/design-tasks/${taskId}/edit-references?ref=${id}`},{status:201});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'改图参考上传失败'},{status:400});}
}
