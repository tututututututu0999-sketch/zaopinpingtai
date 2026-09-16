import {NextResponse} from 'next/server';
import {confirmBrief} from '@/lib/brief-drafts';
export async function POST(request:Request){try{const {draftId,revision}=await request.json();if(typeof draftId!=='string'||!Number.isInteger(revision))throw new Error('需求版本无效');return NextResponse.json(await confirmBrief(draftId,revision));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'确认失败'},{status:409});}}
