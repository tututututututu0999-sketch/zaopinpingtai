import type {BriefAnalysis} from './brief';
// The strategy report needs visual decisions, not confidence/evidence used by
// human review or the repeated retrieval query. Never trim user constraints.
export function compactReportReference(description:string):string{
 let data;try{data=JSON.parse(description);}catch{return description;}
 const profile=data.profile??data;
 if(!profile?.title||!profile?.selling)return description;
 const groups=Object.fromEntries(Object.entries(profile).map(([key,value])=>{
  const group=value as Record<string,unknown>;
  return [key,Object.fromEntries(Object.entries(group).filter(([field,val])=>!['confidence','evidence'].includes(field)&&val!==''&&!(Array.isArray(val)&&val.length===0)))];
 }));
 return JSON.stringify({...(data.role?{role:data.role,instruction:data.instruction,note:data.note}:{}),profile:groups});
}
export function referenceReportInput(input:{analysis:BriefAnalysis;primaryDescription:string;helperDescriptions:string[]}){
 const a=input.analysis;
 return {priority:'用户最新明确需求 > 原始需求 > 参考图 > AI建议。用户指定颜色时仅借鉴参考的构图与质感，不建议照搬冲突配色。',analysis:{originalBrief:a.originalBrief,supplements:a.supplements,generationConstraints:a.generationConstraints,generationNotes:a.generationNotes,designDirection:a.designDirection,designKeywords:a.designKeywords,audience:a.audience,usageScenario:a.usageScenario,productValue:a.productValue,emotionalValue:a.emotionalValue,materialType:a.materialType,grade:a.grade,subject:a.subject,hardConstraints:a.hardConstraints,mustAvoid:a.mustAvoid,preferences:a.preferences},primaryDescription:compactReportReference(input.primaryDescription),helperDescriptions:input.helperDescriptions.map(compactReportReference)};
}
