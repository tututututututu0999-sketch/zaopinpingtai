export function editReferenceRoles(refs=[]){return ['图1：所选改图底图',...refs.map((ref,index)=>`图${index+2}：本次${{character:'人物/IP替换来源，须出现在成图中，保持身份及照片或插画表现',style:'风格参考，仅借鉴色彩、质感与画风',layout:'排版参考，仅借鉴布局与比例'}[ref.role]}${ref.note?'；使用说明：'+ref.note:''}；只影响本次指定修改，不照搬其他元素、旧文字或品牌`)];}
export function referenceInstruction(reference){
 const instructions={character:'封面唯一IP身份来源，必须在画面中清晰可见，不得省略或替换；保留原图是真人照片还是插画的表现、五官、服装与标志特征；其他图不提供角色身份',style:'仅参考色彩、画风和质感，不采用人物身份或旧文案',layout:'仅参考构图与信息排布，不采用人物身份或旧文案'};
 return `${instructions[reference.role]}${reference.note?`；用户补充：${reference.note}`:''}`;
}
export function buildReferenceRoles({references=[],uploads=[],baseKind,referencePlan,creativity='faithful'}){
 const roles=[...(baseKind?[baseKind==='edit'?'改图底图，按修改意见调整':'已确认父主视觉，统一套系']:[]),...references.map((ref,index)=>`${index===0?(creativity==='exploratory'?'主参考：配色沿用，可探索新构图':'主参考：构图、标题与配色'):'辅助视觉'}${ref.id===referencePlan?.sellingSourceId?'；卖点结构来源':''}${uploads.some(row=>row.role==='character')?'；不采用其中的角色':''}`),...uploads.map(ref=>referenceInstruction(ref)+(ref.id===referencePlan?.sellingSourceId?'；卖点结构来源':''))].map((role,index)=>`图${index+1}：${role}`);
 const style=uploads.findIndex(ref=>ref.role==='style');
 const paletteIndex=baseKind?0:style>=0?references.length+style:references.length?0:Math.max(0,uploads.findIndex(ref=>ref.role==='layout'));
 if(roles.length)roles[paletteIndex]+='；配色基准'+(!baseKind&&!references.length&&style<0&&uploads.every(ref=>ref.role==='character')?'（仅角色图：取其可见色系协调背景，保留角色本色）':'');
 if(referencePlan?.sellingType)roles.push(`图${roles.length+1}：卖点${referencePlan.sellingType}的单元结构样图，逐条沿用数字、单位、边界与说明的相对位置；这是局部放大图，不是封面占比，不放大成主视觉；不复制文字、水印或颜色`);
 return roles;
}
