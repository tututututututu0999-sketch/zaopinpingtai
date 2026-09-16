import {NextResponse} from 'next/server';
import {getConfirmedBrief} from '@/lib/brief-drafts';
import {retrieveVectorCandidateSuites,vectorStatus,retrievalAvailability} from '@/lib/real-retrieval';
export async function POST(request:Request){
 const input=await request.json().catch(()=>null);
 if(typeof input?.draftId!=='string'||!Number.isInteger(input.revision))return NextResponse.json({error:'请先分析并确认设计方向，再提交检索'},{status:400});
 try{const analysis=await getConfirmedBrief(input.draftId,input.revision);const status=await vectorStatus();if(!status.ready)return NextResponse.json({error:status.reason,status:'UNAVAILABLE'},{status:503});
  const candidates=await retrieveVectorCandidateSuites(analysis,{excludeMaterialType:input.excludeMaterialType==='GIFT_BOX'?'GIFT_BOX':undefined});await getConfirmedBrief(input.draftId,input.revision);
  return NextResponse.json({mode:'pgvector',draftId:input.draftId,revision:input.revision,candidates,indexedAssets:status.indexedAssets,reason:candidates.length?undefined:await retrievalAvailability(analysis)});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'检索失败',status:'UNAVAILABLE'},{status:409});}
}
