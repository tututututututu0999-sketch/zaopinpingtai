import {TITLE_TYPES,SELLING_TYPES} from './v1/index.mjs';

export function constraintLabel(rule){
 const value=rule.field==='title'?TITLE_TYPES[rule.value]?.[0]:rule.field==='selling'?SELLING_TYPES[rule.value]?.[0]:rule.field==='selling.count'?`${rule.value}条卖点`:rule.value;
 return `${rule.operator==='exclude'?'不使用':'采用'}${value||rule.value}`;
}

// Only an explicit reference-selection clause can reject an input image.
// A final-cover specification, even when mandatory, belongs to generation.
export function isReferenceRequirement(evidence,source){
 if(typeof evidence!=='string'||!evidence.trim()||!source?.includes(evidence))return false;
 return source.split(/[。；;\n]/).some(clause=>clause.includes(evidence)&&/(?:参考(?:图|素材|图片)|素材(?:库|图片)?|检索|搜索|筛选)/.test(clause)&&/(?:只(?:找|选|搜|要)|必须|不要|排除|不能|不得|不含|不包含|需要.*(?:包含|具备)|仅.*(?:包含|具备))/.test(clause));
}
export function scopeBriefConstraints(analysis){
 const source=[analysis.originalBrief,...analysis.supplements||[]].filter(Boolean).join('\n');
 const hard=[],generation=[...analysis.generationConstraints||[]];
 const preferences={title:[],selling:[],subject:[],...analysis.preferences};
 for(const rule of analysis.hardConstraints||[]){
  if(isReferenceRequirement(rule.evidence,source)){hard.push(rule);continue;}
  generation.push(rule);
  if(rule.operator==='include'&&rule.field in preferences)preferences[rule.field]=[...new Set([...preferences[rule.field],rule.value])];
 }
 const unresolved=[],generationNotes=[...analysis.generationNotes||[]];
 for(const note of analysis.unsupportedConstraints||[]){
  if(/^(?:用户|需求|原始需求|用户需求)?(?:尚未|未)(?:明确|指定|提供|说明|给出)/.test(note.trim()))continue;
  if(isReferenceRequirement(note,source))unresolved.push(note);else generationNotes.push(note);
 }
 const seen=new Set();
 return {...analysis,constraintScopeVersion:2,hardConstraints:hard,preferences,generationConstraints:generation.filter(rule=>{const key=JSON.stringify(rule);if(seen.has(key))return false;seen.add(key);return true;}),unsupportedConstraints:unresolved,generationNotes:[...new Set(generationNotes)]};
}

export function referenceConstraintsForRole(constraints,role){
 // IP sheets supply identity, not a finished cover with titles and selling points.
 return role==='character'?constraints.filter(rule=>rule.field==='subject'):constraints;
}
