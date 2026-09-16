import {GROUPS,FIELD_LABELS,TITLE_TYPES,SELLING_TYPES,type VisualProfile} from '@/visual-rules/v1/index.mjs';
const statuses={OBSERVED:'已观察',ABSENT:'未出现',UNKNOWN:'无法判断',OTHER:'其他'};
export default function VisualProfileView({profile}:{profile:VisualProfile}){
 return <div className="visual-profile-groups">{Object.entries(GROUPS).map(([key,definition])=>{
  const group=profile[key as keyof VisualProfile];if(!group)return null;
  const types=group.types.map(type=>(key==='title'?TITLE_TYPES[type]?.[0]:key==='selling'?SELLING_TYPES[type]?.[0]:null)||type);
  return <section className="visual-profile-group" key={key}><header><h4>{definition.label}</h4><span className="badge badge-neutral">{statuses[group.status]}</span></header>
   {types.length>0&&<div className="visual-profile-tags">{types.map(type=><span key={type}>{type}</span>)}</div>}
   <dl>{definition.fields.filter(field=>Boolean(group[field])).map(field=><div key={field}><dt>{FIELD_LABELS[field]||field}</dt><dd>{String(group[field])}</dd></div>)}</dl>
   {group.evidence&&<details><summary>观察依据 · 置信度 {Math.round(group.confidence*100)}%</summary><p>{group.evidence}</p></details>}
  </section>;
 })}</div>;
}
