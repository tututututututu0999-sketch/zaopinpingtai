// Deterministic checks for known contradictions; explicit user restrictions
// are never silently deleted. This is a guard, not a full semantic verifier.
export function promptConflicts(draft,{uploadedReferences=[],referencePlan=draft.referencePlan}={}) {
 const issues=[];const positive=draft.prompt||'',negative=draft.negativePrompt||'';
 if(uploadedReferences.some(item=>item.role==='character')){
  const bans=/(?:不使用|忽略|弃用)(?:本次|已)?上传(?:的)?(?:角色|人物|IP|图片)|(?:不出现|不使用|不要|禁止|不能出现|不得出现|不含|没有|无)(?:任何|任何形式的)?(?:人物|真人|人像|角色|肖像|照片)/i;
  const clauses=positive.split(/[。；;\n]/).filter(text=>bans.test(text)&&!/(?:多余|额外|其他|旧图|套系图|参考图中|未授权)/.test(text));
  if(clauses.length)issues.push('封面 IP 已上传，但正文禁止或忽略人物／角色');
  if(negative.split(/[、，,；;。\n]/).some(text=>/^(?:无|不要|禁止|避免|不使用)?(?:人物|真人|人像|角色|肖像|人物角色|角色人物|人物吉祥物|照片质感|摄影人物|photographs?|people|person|characters?)$/i.test(text.trim())))issues.push('反向提示词排除了已上传的封面 IP 或照片表现');
  if(!/(?:必须|需|要|保留|使用|采用|呈现|出现|展示).{0,30}(?:上传|IP|角色|人物)|(?:上传|IP).{0,30}(?:可见|出镜|人物|主体|角色)/i.test(positive))issues.push('正文未明确要求上传的封面 IP 出现在画面中');
 }
 const selling=positive.match(/【卖点结构】([\s\S]*?)(?=【|$)/)?.[1]||'';
 if(['C','H'].includes(referencePlan?.sellingType)){
  if(/(?:添加|加入|配上|搭配|使用|左侧放).{0,5}(?:图标|头像|独立卡片|胶囊)/.test(selling.replace(/(?:不|禁止|不要|不得)(?:添加|加入|使用).{0,20}/g,'')))issues.push('卖点结构加入了所选分类禁止的图标或卡片');
 }
 return issues;
}
export function assertPromptCompatible(draft,context){
 const issues=promptConflicts(draft,context);
 if(issues.length)throw new Error(`提示词存在冲突：${issues.join('；')}。请重新组合提示词或修正冲突，未提交生图。`);
}
