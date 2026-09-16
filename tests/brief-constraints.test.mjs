import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBriefConstraints} from '../visual-rules/v1/index.mjs';
test('unspecified design choices do not block retrieval; explicit constraints survive',()=>{
 const original={assumptions:['年级未指定'],unsupportedConstraints:['用户未明确要求平面或立体设计形式，无法验证','用户未明确礼盒尺寸、结构、开合方式与印刷工艺','用户未明确是否需要真人肖像、二维插画或三维角色表现','参考图必须采用烫金工艺'],hardConstraints:[{field:'subject',operator:'exclude',value:'真人肖像',evidence:'不要真人'}]};
 const result=normalizeBriefConstraints(original);
 assert.deepEqual(result.unsupportedConstraints,['参考图必须采用烫金工艺']);assert.equal(result.assumptions.length,4);assert.deepEqual(result.hardConstraints,original.hardConstraints);assert.equal(original.unsupportedConstraints.length,4);
 assert.deepEqual(normalizeBriefConstraints(result),result);
});
