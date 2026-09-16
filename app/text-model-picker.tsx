"use client";
import {useEffect,useState} from 'react';
import {RefreshCw} from './ui-icons';
type Model={id:string;available:boolean;vision:boolean;latencyMs:number|null;message:string;checkedAt:string};
export default function TextModelPicker({value,onChange,disabled}:{value:string;onChange:(model:string)=>Promise<void>;disabled:boolean}){
 const [models,setModels]=useState<Model[]>([]),[busy,setBusy]=useState(''),[error,setError]=useState('');
 async function load(){try{const response=await fetch('/api/text-models',{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'模型状态读取失败');setModels(data.models??[]);}catch(error){setError(error instanceof Error?error.message:'读取失败');}}
 useEffect(()=>{load();},[]);
 async function probe(model:string){setBusy(model);setError('');try{const response=await fetch('/api/text-models',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model})});const data=await response.json();if(!response.ok)throw new Error(data.error);await load();}catch(error){setError(error instanceof Error?error.message:'检测失败');}finally{setBusy('');}}
 return <section className="text-model-picker" aria-label="创作文本模型"><div><label>文本与识图模型<select aria-label="文本与识图模型" disabled={disabled||Boolean(busy)||!models.length} value={value} onChange={event=>onChange(event.target.value)}>{!models.length&&<option value={value}>{value}</option>}{models.map(model=><option key={model.id} value={model.id} disabled={!model.available||!model.vision}>{model.id}{model.available&&model.vision?' · 已验证识图':' · 暂不可用'}</option>)}</select></label><p>用于需求分析、上传图识别、报告和提示词。切换保留参考及生成历史，重新生成报告和提示词。</p></div><details><summary>模型检测状态</summary><div className="model-check-list">{models.map(model=><div key={model.id}><span><b>{model.id}</b><small>{model.message}{model.latencyMs?` · ${(model.latencyMs/1000).toFixed(1)}s`:''}</small></span><button className="button button-secondary" disabled={disabled||Boolean(busy)} onClick={()=>probe(model.id)}><RefreshCw size={13}/>{busy===model.id?'检测中…':'重新检测'}</button></div>)}</div><small>检测会调用所选模型识别一张测试图；通过不代表长期稳定。</small></details>{error&&<p role="alert">{error}</p>}</section>;
}
