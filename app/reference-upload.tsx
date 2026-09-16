"use client";
import {useRef} from 'react';
import {Check,Trash2,Upload} from './ui-icons';
import {WorkflowButton} from './workflow-feedback';

export type TaskReference={id:string;filename:string;mimeType:string;createdAt:string;url:string;role:'character'|'style'|'layout';note:string};
export const uploadRoleNames={character:'封面 IP',style:'整体风格',layout:'排版结构'};
export default function ReferenceUpload({references,edits,role,busy,onRole,onEdit,onSave,onRemove,onUpload}:{references:TaskReference[];edits:Record<string,string>;role:TaskReference['role'];busy:boolean;onRole:(role:TaskReference['role'])=>void;onEdit:(id:string,value:string)=>void;onSave:(reference:TaskReference)=>void;onRemove:(id:string)=>void;onUpload:(files:FileList|null)=>Promise<void>}){
 const input=useRef<HTMLInputElement>(null);
 return <section className="reference-upload-panel" aria-label="本次上传参考">
  <header><p>按用途上传风格、排版或封面 IP，选填每张图的使用说明。</p></header>
  <div className="upload-reference-list">{references.map(reference=><article key={reference.id} className="upload-reference-card">
   <div className="upload-reference-preview"><img src={reference.url} alt={reference.filename}/></div><div className="upload-reference-body"><span className="badge badge-neutral">{uploadRoleNames[reference.role]}</span><p className="upload-reference-name" title={reference.filename}>{reference.filename}</p>
   <label>使用说明<textarea rows={2} aria-label={`${reference.filename} 使用说明`} placeholder="选填，例如保留人物外貌与服装" maxLength={180} disabled={busy} value={edits[reference.id]??reference.note} onChange={event=>onEdit(reference.id,event.target.value)}/></label>
   <div className="upload-reference-actions"><button type="button" className="button button-secondary" disabled={busy||edits[reference.id]===undefined||edits[reference.id]===reference.note} onClick={()=>onSave(reference)}><Check size={14}/>保存说明</button><button type="button" className="button button-ghost" disabled={busy} onClick={()=>onRemove(reference.id)}><Trash2 size={14}/>移除</button></div></div>
  </article>)}</div>
  <div className="upload-reference-controls"><label>上传用途<select aria-label="上传用途" value={role} disabled={busy} onChange={event=>onRole(event.target.value as TaskReference['role'])}>{Object.entries(uploadRoleNames).map(([value,name])=><option key={value} value={value}>{name}</option>)}</select></label>
  <input ref={input} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" multiple={role!=='character'} onChange={async event=>{await onUpload(event.target.files);if(input.current)input.current.value='';}}/>
  <WorkflowButton className="button button-secondary" disabled={busy||references.length>=6||(role==='character'&&references.some(ref=>ref.role==='character'))} onClick={()=>input.current?.click()} icon={<Upload size={15}/>}>上传{uploadRoleNames[role]}图片</WorkflowButton></div><small>最多 6 张，封面 IP 最多 1 张。支持 PNG、JPG、WebP。</small>
 </section>;
}
