import {NextResponse} from 'next/server';
import {confirmUploadedReferences} from '@/lib/design-tasks';
export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
 try{return NextResponse.json(await confirmUploadedReferences((await params).id));}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:'上传参考确认失败'},{status:409});}
}
