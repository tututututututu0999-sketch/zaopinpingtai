import sharp from 'sharp';
import {readModelAnswer} from './model-response';
import {query} from './db';
export const TEXT_MODELS=['gpt-5.6-luna','gpt-5.6-terra','qwen-3.8-free'] as const;
export type TextModel=typeof TEXT_MODELS[number];
type Check={id:TextModel;available:boolean;vision:boolean;protocol:'responses'|'chat';latencyMs:number|null;message:string;checkedAt:string};
// Live gateway pixel checks, not claims inferred from model names or /models.
const checks:Record<TextModel,Check>=Object.fromEntries(TEXT_MODELS.map(id=>[id,{id,available:false,vision:false,protocol:'responses',latencyMs:null,message:'尚未检测，检测通过后可选',checkedAt:''}])) as Record<TextModel,Check>;
export async function modelOptions(){const rows=(await query<{model_id:string;result:Check}>('SELECT model_id,result FROM text_model_checks')).rows;return TEXT_MODELS.map(id=>rows.find(row=>row.model_id===id)?.result??({...checks[id]}));}
export async function requireTextModel(value:unknown):Promise<TextModel>{
 if(typeof value!=='string'||!TEXT_MODELS.includes(value as TextModel))throw new Error('请选择支持的文本模型');
 const model=value as TextModel;const check=(await modelOptions()).find(item=>item.id===model)!;if(!check.vision||!check.available)throw new Error(`${model} 尚未通过当前网关识图检查，请先重新检测或选择其他模型`);return model;
}
export async function modelProtocol(model:string){return (await modelOptions()).find(item=>item.id===model)?.protocol??'responses';}
const inFlight=new Map<TextModel,Promise<Check>>();
export async function checkTextModel(value:unknown){
 if(typeof value!=='string'||!TEXT_MODELS.includes(value as TextModel))throw new Error('未知模型');const id=value as TextModel;
 if(inFlight.has(id))return inFlight.get(id)!;
 const operation=(async()=>{
  const b=process.env.AI_GATEWAY_BASE_URL?.replace(/\/$/,'');if(!b)throw new Error('网关未配置');const root=b.endsWith('/v1')?b:b+'/v1';
  const png=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160"><rect width="480" height="160" fill="white"/><circle cx="80" cy="80" r="48" fill="#e52222"/><rect x="190" y="32" width="96" height="96" fill="#13a144"/><path d="M400 25 L455 130 L345 130Z" fill="#174be6"/></svg>')).png().toBuffer();
  const url=`data:image/png;base64,${png.toString('base64')}`;
  const text='Identify the three large colored shapes from left to right in the image. Return only JSON {"colors":[lowercase English color names],"shapes":[lowercase singular English shape names]}. Do not guess if unable to see the image.';
  const start=Date.now();let message='未通过图片识别检测';
  for(const protocol of ['responses','chat'] as const){try{
   const response=await fetch(root+(protocol==='responses'?'/responses':'/chat/completions'),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.AI_GATEWAY_API_KEY}`},body:JSON.stringify(protocol==='responses'?{model:id,stream:true,input:[{role:'user',content:[{type:'input_text',text},{type:'input_image',image_url:url}]}]}:{model:id,stream:true,messages:[{role:'user',content:[{type:'text',text},{type:'image_url',image_url:{url}}]}]}),signal:AbortSignal.timeout(25000),cache:'no-store'});
   if(!response.ok){message=`网关返回 ${response.status}，未通过识图检测`;continue;}
   const answer=JSON.parse((await readModelAnswer(response)).replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
   const colors=answer.colors?.map((item:unknown)=>typeof item==='string'?item.trim().toLowerCase():item);
   const shapes=answer.shapes?.map((item:unknown)=>typeof item==='string'?item.trim().toLowerCase():item);
   if(JSON.stringify(colors)!=='["red","green","blue"]'||shapes?.length!==3||shapes[0]!=='circle'||!['square','rectangle'].includes(shapes[1])||shapes[2]!=='triangle'){message='图片内容识别不正确，暂不启用';continue;}
   return checks[id]={id,available:true,vision:true,protocol,latencyMs:Date.now()-start,message:'识图测试通过',checkedAt:new Date().toISOString()};
  }catch(error){message=error instanceof Error&&['TimeoutError','AbortError'].includes(error.name)?'识图测试超时': '识图请求失败，请稍后重新检测';}}
  return checks[id]={...checks[id],available:false,vision:false,latencyMs:null,message,checkedAt:new Date().toISOString()};
 })();inFlight.set(id,operation);try{const result=await operation;await query('INSERT INTO text_model_checks(model_id,result) VALUES($1,$2::jsonb) ON CONFLICT(model_id) DO UPDATE SET result=excluded.result',[id,JSON.stringify(result)]);return result;}finally{inFlight.delete(id);}
}
