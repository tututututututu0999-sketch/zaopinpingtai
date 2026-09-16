import {NextResponse} from 'next/server';
import {confirmReview,chooseSuitePrimary} from '@/lib/unified-review';
export async function PATCH(request:Request){try{const body=await request.json();return NextResponse.json(body.action==='primary'?await chooseSuitePrimary(body.suiteId,body.assetId):await confirmReview(body.items));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'审核保存失败'},{status:400});}}
