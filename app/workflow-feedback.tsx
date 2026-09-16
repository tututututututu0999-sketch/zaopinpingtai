"use client";
import {useEffect,useState,type ComponentProps} from 'react';
import {StatefulButton} from '@/components/motion/button/stateful';
import {ThinkingShimmer} from '@/components/agents/loading-states/thinking-shimmer';
import {Loader} from '@/components/motion/loader';
import {Check,AlertCircle} from 'lucide-react';

export function WorkflowButton({busy=false,error=false,...props}:ComponentProps<typeof StatefulButton>&{busy?:boolean;error?:boolean}) {
 const [mounted,setMounted]=useState(false);
 useEffect(()=>setMounted(true),[]);
 // beUI's per-letter animation has different reduced-motion markup. Render a
 // stable server shell, then let the installed component read OS preferences.
 if(!mounted)return <button type={props.type??'button'} className={props.className} disabled>{props.children}</button>;
 return <StatefulButton {...props} state={busy?'loading':error?'error':'idle'} errorText={props.errorText??props.children}/>;
}
const tips=['先确认标题和卖点文案，再微调画面风格。','主参考延续套系气质，辅助参考补充版式细节。','提示词生成后，你仍可修改文案、比例和参考图。'];
export function WorkflowFeedback({busy=false,title,detail,error,success,variant='morph'}:{busy?:boolean;title:string;detail?:string;error?:string;success?:string;variant?:'morph'|'comet'|'bars'}) {
 const [seconds,setSeconds]=useState(0);
 useEffect(()=>{setSeconds(0);if(!busy)return;const start=Date.now();const timer=setInterval(()=>setSeconds(Math.floor((Date.now()-start)/1000)),1000);return()=>clearInterval(timer);},[busy]);
 if(!busy&&!error&&!success)return null;
 return <div className={`workflow-feedback ${error?'is-error':success?'is-success':''}`}>
  <span className="workflow-feedback-icon" aria-hidden="true">{busy?<Loader variant={variant} size={28}/>:error?<AlertCircle size={22}/>:<Check size={22}/>}</span>
  <div className="workflow-feedback-copy"><div role={error?'alert':'status'}>{busy?<ThinkingShimmer>{title}</ThinkingShimmer>:<b>{error||success}</b>}</div>
  {busy&&<><p>{seconds>=45?'等待时间较长，仍在等待服务返回；无需重复点击。':detail}</p><small className="workflow-tip">设计小提示 · {tips[Math.floor(seconds/9)%tips.length]}</small></>}</div>
  {busy&&<span className="workflow-elapsed" aria-label={`已等待 ${seconds} 秒`}>{seconds}s</span>}
 </div>;
}
