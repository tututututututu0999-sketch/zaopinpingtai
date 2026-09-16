import test from 'node:test';
import assert from 'node:assert/strict';
import {scopeBriefConstraints,referenceConstraintsForRole,constraintLabel} from '../visual-rules/constraint-scope.mjs';
import {assembleImage2Prompt,buildReferencePlan} from '../visual-rules/generation.mjs';
const title={field:'title',operator:'include',value:'ROUNDED_OUTLINE',evidence:'文字采用厚重圆润粗体，带分层描边'};
const selling={field:'selling',operator:'include',value:'E',evidence:'每条卖点搭配一个扁平的icon'};
const count={field:'selling.count',operator:'include',value:'3',evidence:'核心卖点描述（3条，平行层级）'};
test('legacy final-cover rules become generation requirements and survive in final prompt',()=>{
 const input={originalBrief:[title.evidence,selling.evidence,count.evidence].join('；'),hardConstraints:[title,selling,count],unsupportedConstraints:[],preferences:{title:[],selling:[],subject:[]},mustAvoid:[]};
 const result=scopeBriefConstraints(input);
 assert.deepEqual(result.hardConstraints,[]);assert.equal(result.generationConstraints.length,3);assert.deepEqual(result.preferences.selling,['E']);
 assert.equal(constraintLabel(title),'采用圆润厚描边');
 assert.deepEqual(scopeBriefConstraints(result),result);assert.equal(input.hardConstraints.length,3);
 const prompt=assembleImage2Prompt({analysis:result,draft:{prompt:'制作礼盒封面',negativePrompt:''},size:'1024x1536'});
 for(const rule of [title,selling,count])assert.ok(prompt.includes(rule.evidence));assert.ok(!prompt.includes('ROUNDED_OUTLINE'));
});
test('explicit reference exclusions survive, role-specific requirements skip unrelated IP fields',()=>{
 const noHuman={field:'subject',operator:'exclude',value:'真人肖像',evidence:'参考图片必须不含真人肖像'};
 const result=scopeBriefConstraints({originalBrief:noHuman.evidence,hardConstraints:[noHuman,title],unsupportedConstraints:[]});
 assert.deepEqual(result.hardConstraints,[noHuman]);assert.deepEqual(referenceConstraintsForRole([noHuman,title],'character'),[noHuman]);
 const supplementary=scopeBriefConstraints({originalBrief:'制作礼盒',supplements:[noHuman.evidence],hardConstraints:[noHuman]});assert.equal(supplementary.hardConstraints.length,1);
 const required='参考图必须采用烫金工艺';assert.deepEqual(scopeBriefConstraints({originalBrief:required,unsupportedConstraints:[required]}).unsupportedConstraints,[required]);
});
test('no-reference creation supports automatic and specified selling layouts without fake source images',()=>{
 const automatic=buildReferencePlan([],{allowEmpty:true});assert.equal(automatic.sellingSourceId,'');assert.match(automatic.sellingInstruction,/没有卖点参考图/);
 const selected=buildReferencePlan([],{allowEmpty:true,sellingType:'H'});assert.match(selected.sellingInstruction,/采用H/);
 assert.throws(()=>buildReferencePlan([]));assert.throws(()=>buildReferencePlan([],{allowEmpty:true,sellingSourceId:'foreign'}));
});
