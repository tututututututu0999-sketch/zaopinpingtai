// Shared by composition, browser preview and the actual image request.
export const COVER_HIERARCHY='标题为第一视觉层级，插图/IP为第二层，卖点为紧凑辅助层。无明确版式时，标题区高约25–40%、主体区约25–40%；有卖点时整组默认置底部，高约8–15%，多行长文案可到18%，数字字高约主标题的1/4–1/3。百分比为画布高度的布局建议，不是墨迹面积，各区可错位重叠但不遮字；不把卖点铺满下半画面。用户指定位置及参考实际比例优先；无主体/无卖点不强行添加。延展物料按其用途调整。';
export function userColorRequirements(analysis={}){
 // Only original user text, never AI color keywords or reference descriptions.
 return [analysis.originalBrief,...(analysis.supplements||[])].filter(Boolean).flatMap((text,index)=>text.split(/[。；;\n]/).filter(clause=>!/^\s*(?:主标题|副标题|卖点|文案)\s*[:：]/.test(clause)&&/(?:色调|配色|颜色|主色|背景.{0,8}色|#[0-9a-f]{6}|[蓝红黄绿紫橙粉黑白灰青棕金银]色)/i.test(clause)).map(clause=>`${index?'补充'+index:'原始需求'}：${clause.trim()}`));
}
export function palettePolicy(referenceRoles=[],analysis={}){
 const explicit=userColorRequirements(analysis);
 if(explicit.length)return `用户颜色要求优先于全部参考与底图：${explicit.join('；')}。有冲突按较新补充执行；参考仅借鉴构图、质感与层次，不覆盖指定色调。不以边角点缀代替整体色调要求。`;
 const source=referenceRoles.find(role=>role.includes('配色基准'));
 const hasReference=referenceRoles.some(role=>!role.includes('单元结构样图'));
 return source?`${source.split('：')[0]}为配色基准：沿用原图主色、背景、标题色、强调色及面积与明度关系。仅用户原文或最新修改明确指定的颜色可覆盖；AI分析、风格词、旧报告及旧稿自选颜色不作指定。卖点样图不提供配色；自由度不改变此规则。`:hasReference?'沿用实际参考图配色及明度关系；仅用户明确指定颜色可覆盖，忽略AI推导的配色；卖点样图不提供色板。':'无整体参考：AI依据本次需求自主设计配色，不预置蓝橙白或其他固定色板；用户指定颜色优先。';
}
