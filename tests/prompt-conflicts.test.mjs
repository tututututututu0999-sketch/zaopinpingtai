import test from 'node:test';
import assert from 'node:assert/strict';
import {promptConflicts,assertPromptCompatible} from '../visual-rules/prompt-conflicts.mjs';
const context={uploadedReferences:[{role:'character'}]};
test('uploaded IP cannot be excluded by invented subject restrictions',()=>{
 const broken={prompt:'【任务】文字主导；不使用上传角色图，封面不出现人物。',negativePrompt:'错误文字、角色人物、照片质感'};
 assert.ok(promptConflicts(broken,context).length>=2);assert.throws(()=>assertPromptCompatible(broken,context),/未提交生图/);
 assert.deepEqual(promptConflicts({prompt:'使用上传IP作为可见人物主体，其他参考不提供人物身份；标题仍为视觉重点。',negativePrompt:'多余人物、旧品牌、错误文字'},context),[]);
 assert.deepEqual(promptConflicts(broken,{uploadedReferences:[]}),[]);
});
