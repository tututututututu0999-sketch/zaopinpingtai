"use client";
import {useState} from 'react';
import {Copy,Check} from './ui-icons';

export default function FinalPrompt({text,length}:{text:string;length:number}){
 const [copied,setCopied]=useState('');
 const [error,setError]=useState('');
 async function copy(){
  setError('');
  try{await navigator.clipboard.writeText(text);setCopied(text);}
  catch{setCopied('');setError('复制失败，请选中下方完整提示词手动复制。');}
 }
 return <div className="prompt-editor final-prompt-only">
  <div className="final-prompt-toolbar"><p className="prompt-length" role="status">实际发送提示词 {length} / 2000 字</p><button type="button" className="button button-secondary" onClick={copy} disabled={!text}>{copied===text?<Check size={15}/>:<Copy size={15}/>}<span aria-live="polite">{copied===text?'已复制':'复制提示词'}</span></button></div>
  <textarea className="image-prompt-text" aria-label="实际发送的完整提示词" readOnly value={text}/>
  {error&&<p className="copy-error" role="alert">{error}</p>}
 </div>;
}
