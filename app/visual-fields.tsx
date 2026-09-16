"use client";
import {GROUPS,FIELD_LABELS,TITLE_TYPES,SELLING_TYPES,SUBJECT_TYPES,type VisualProfile} from '@/visual-rules/v1/index.mjs';
export default function VisualFields({profile,onChange,disabled=false}:{profile:VisualProfile;onChange:(profile:VisualProfile)=>void;disabled?:boolean}){
 return <div className="unified-visual-fields">{Object.entries(GROUPS).map(([key,definition])=>{
  const group=profile[key as keyof VisualProfile];
  const options=key==='title'?TITLE_TYPES:key==='selling'?SELLING_TYPES:key==='subject'?Object.fromEntries(SUBJECT_TYPES.map(value=>[value,[value]])):null;
  const update=(field:string,value:unknown)=>onChange({...profile,[key]:{...group,[field]:value}});
  return <details key={key} open={group.confidence<.8}><summary>{definition.label}<span>{group.confidence<.8?'需要核对':group.status==='ABSENT'?'未出现':group.status==='UNKNOWN'?'无法判断':group.types.map(type=>options?.[type]?.[0]||type).join('、')||'已识别'}</span></summary><fieldset disabled={disabled}>
   <label>观察状态<select value={group.status} onChange={event=>onChange({...profile,[key]:{...group,status:event.target.value,types:['ABSENT','UNKNOWN'].includes(event.target.value)?[]:group.types}})}>{Object.entries({OBSERVED:'已观察',ABSENT:'未出现',UNKNOWN:'无法判断',OTHER:'其他'}).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   {options?<div className="visual-type-options">{Object.entries(options).map(([id,label])=><label key={id}><input type="checkbox" disabled={['UNKNOWN','ABSENT'].includes(group.status)} checked={group.types.includes(id)} onChange={event=>update('types',event.target.checked?[...group.types,id]:group.types.filter(type=>type!==id))}/>{label[0]}</label>)}</div>:<label>分类词<input value={group.types.join('、')} onChange={event=>update('types',event.target.value.split(/[、，,]/).filter(Boolean))}/></label>}
   {definition.fields.map(field=><label key={field}>{FIELD_LABELS[field]}<input value={String(group[field]??'')} onChange={event=>update(field,event.target.value)}/></label>)}
   <label>观察依据<textarea rows={2} value={group.evidence} onChange={event=>update('evidence',event.target.value)}/></label>
  </fieldset></details>;
 })}</div>;
}
