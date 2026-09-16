import test from 'node:test';
import assert from 'node:assert/strict';
import {canConfirmReview,reviewBlocker} from '../visual-rules/review-state.mjs';
test('reopened basic review keeps a confirmed visual snapshot actionable',()=>{
 const asset={previewUrl:'/preview',reviewState:'PENDING',reuseState:'REUSABLE'};
 const rev={status:'WAITING_ELIGIBILITY',confirmed:{title:{}}};
 const primary={reviewState:'CONFIRMED',reuseState:'REUSABLE'};
 assert.equal(canConfirmReview(asset,rev),true);
 assert.match(reviewBlocker(asset,rev,primary),/还需确认基础信息/);
 assert.equal(canConfirmReview(asset,{...rev,confirmed:null}),false);
 assert.equal(canConfirmReview({...asset,reviewState:'CONFIRMED'},rev),false);
 assert.equal(canConfirmReview(asset,{...rev,status:'PROCESSING_TEXT'}),false);
 assert.match(reviewBlocker({...asset,reviewState:'CONFIRMED'},rev),/尚未选择/);
 assert.match(reviewBlocker({...asset,reviewState:'CONFIRMED'},rev,{...primary,reviewState:'PENDING'}),/先审核/);
 assert.equal(canConfirmReview({...asset,previewUrl:null},rev),false);
});
