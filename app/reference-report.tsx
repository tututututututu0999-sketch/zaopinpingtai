"use client";
import {Check,Layers3,ShieldCheck} from './ui-icons';
import type {ReferenceReport} from '@/lib/brief';

export default function ReferenceReportView({report}:{report:ReferenceReport}) {
  const groups=[{title:'参考理由',items:report.reasons,icon:Layers3},{title:'本次采用',items:report.reusableElements,icon:Check},{title:'需要注意',items:report.riskNotes,icon:ShieldCheck}];
  const long=report.summary.length>120||groups.some(group=>group.items.length>3||group.items.some(item=>item.length>100));
  const content=<div className="reference-report-grid">{groups.map(({title,items,icon:Icon})=><section key={title}><h3><Icon size={16}/>{title}</h3>{items.length?<ul>{items.map((item,index)=><li key={index}>{item}</li>)}</ul>:<p>无额外注意项</p>}</section>)}</div>;
  return <div className="reference-report"><div className="reference-report-summary"><span className="eyebrow">本次视觉方案</span><p>{long?`${report.summary.slice(0,100)}${report.summary.length>100?'…':''}`:report.summary}</p></div>{long?<details className="legacy-report"><summary>展开旧版报告完整内容</summary><p>{report.summary}</p>{content}</details>:content}</div>;
}
