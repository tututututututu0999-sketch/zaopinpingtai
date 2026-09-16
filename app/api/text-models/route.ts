import {NextResponse} from 'next/server';
import {modelOptions,checkTextModel} from '@/lib/text-models';
export async function GET(){try{return NextResponse.json({models:await modelOptions(),defaultModel:'gpt-5.6-luna'},{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'无法读取模型状态'},{status:503});}}
export async function POST(request:Request){try{const {model}=await request.json();return NextResponse.json(await checkTextModel(model));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'检测失败'},{status:400});}}
