import {NextResponse} from 'next/server';
import {archiveStatus} from '@/lib/archive-status';
export async function GET(){try{return NextResponse.json(await archiveStatus(),{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'索引状态暂时不可用'},{status:503});}}
