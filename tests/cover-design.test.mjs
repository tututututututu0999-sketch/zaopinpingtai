import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReferenceRoles} from '../visual-rules/reference-roles.mjs';
import {palettePolicy} from '../visual-rules/cover-design.mjs';
import {assembleImage2Prompt,previewImage2Prompt,creativityModes} from '../visual-rules/generation.mjs';
test('palette follows style upload, catalog main, layout or character, independently of freedom and selling crop',()=>{
 for(const creativity of Object.keys(creativityModes)){
  const roles=buildReferenceRoles({references:[{id:'main'}],uploads:[{id:'ip',role:'character',note:''},{id:'style',role:'style',note:''}],creativity,referencePlan:{sellingType:'D'}});
  assert.match(palettePolicy(roles),/^图3为配色基准/);assert.equal(roles.filter(r=>r.includes('配色基准')).length,1);
  assert.match(roles[3],/局部放大图/);assert.doesNotMatch(roles[3],/配色基准/);
 }
 assert.match(palettePolicy(buildReferenceRoles({references:[{id:'main'}]})),/^图1为配色基准/);
 assert.match(palettePolicy(buildReferenceRoles({uploads:[{id:'ip',role:'character',note:''},{id:'layout',role:'layout',note:''}]})),/^图2为配色基准/);
 assert.match(buildReferenceRoles({uploads:[{id:'ip',role:'character',note:''}]}).join(),/取其可见色系/);
 assert.match(palettePolicy(buildReferenceRoles({baseKind:'parent',uploads:[{id:'style',role:'style',note:''}]})),/^图1为配色基准/);
});
test('no-reference can choose palette even with a selling sample; actual request and preview share hierarchy and explicit override',()=>{
 const roles=buildReferenceRoles({referencePlan:{sellingType:'H'}});
 assert.match(palettePolicy(roles),/AI依据本次需求自主设计配色/);
 const input={draft:{prompt:'【文案】数学。四项卖点。',creativity:'faithful'},size:'1024x1536',analysis:{originalBrief:'这次使用紫色背景',designDirection:'童趣',hardConstraints:[],mustAvoid:[],generationNotes:['这次使用紫色背景']},referenceRoles:buildReferenceRoles({references:[{id:'main'}]})};
 const actual=assembleImage2Prompt(input);assert.equal(actual,previewImage2Prompt(input).prompt);
 assert.match(actual,/这次使用紫色背景/);assert.match(actual,/用户颜色要求优先于全部参考与底图/);
 assert.match(actual,/8–15%/);assert.match(actual,/参考实际比例优先/);assert.ok(Array.from(actual).length<=2000);
});
test('original blue palette and newer supplements override references, not inferred color keywords',()=>{
 const analysis={originalBrief:'英语礼盒。整体蓝色调',supplements:['改为浅蓝色，不要深色'],colorKeywords:['红色'],designDirection:'典雅',hardConstraints:[],mustAvoid:[]};
 const prompt=assembleImage2Prompt({analysis,draft:{prompt:'清晰标题与紧凑卖点',negativePrompt:'',creativity:'faithful'},size:'1536x1152',referenceRoles:buildReferenceRoles({references:[{id:'main'}]})});
 assert.match(prompt,/整体蓝色调/);assert.match(prompt,/改为浅蓝色，不要深色/);assert.doesNotMatch(prompt,/红色|配色基准/);assert.ok(prompt.indexOf('整体蓝色调')<prompt.indexOf('清晰标题'));
});
