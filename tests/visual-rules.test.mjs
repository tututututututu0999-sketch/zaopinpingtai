import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProfile,validateProfile,profileSections,TITLE_TYPES,SELLING_TYPES,matchesConstraints,preferenceMatch,validateBriefRules} from '../visual-rules/v1/index.mjs';
test('all eight title and nine selling classes validate independently',()=>{
 for(const [group,types] of [['title',TITLE_TYPES],['selling',SELLING_TYPES]])for(const value of Object.keys(types)){const profile=emptyProfile();profile[group]={...profile[group],status:'OBSERVED',confidence:.9,evidence:'可见结构',types:[value]};assert.equal(validateProfile(profile)[group].types[0],value);assert.match(profileSections(profile).join(' '),new RegExp(types[value][0].replace(/[+＋/]/g,'.')));}
});
test('unknown, absent, mixed and other are distinct; invalid categories rejected',()=>{
 const profile=emptyProfile();assert.equal(profileSections(profile).length,6);profile.title.types=['fictional-font'];assert.throws(()=>validateProfile(profile));profile.title={...profile.title,status:'OBSERVED',evidence:'可见框体及描边',types:['FRAMED','ROUNDED_OUTLINE']};assert.doesNotThrow(()=>validateProfile(profile));profile.title.confidence=NaN;assert.throws(()=>validateProfile(profile));
});
test('legacy and uncertain profiles never satisfy hard exclusions',()=>{
 const rule={field:'subject',operator:'exclude',value:'真人肖像',evidence:'不要真人'};const profile=emptyProfile();assert.equal(matchesConstraints(null,[rule]),false);assert.equal(matchesConstraints(profile,[rule]),false);profile.subject.status='OBSERVED';profile.subject.types=['二维插画'];assert.equal(matchesConstraints(profile,[rule]),true);profile.subject.types=['真人肖像'];assert.equal(matchesConstraints(profile,[rule]),false);
});
test('visual summary does not include OCR or source filenames',()=>{
 const profile=emptyProfile();profile.ocrText='品牌课程1900分钟';profile.filename='source.ai';const summary=profileSections(profile).join('\n');assert.ok(!summary.includes('1900'));assert.ok(!summary.includes('.ai'));
});
test('preferences are graded without turning into exclusions',()=>{
 const profile=emptyProfile();profile.title.types=['FRAMED'];const result=preferenceMatch(profile,{title:['FRAMED','ROUND_PRINT'],selling:[],subject:[]});assert.equal(result.ratio,.5);assert.equal(result.missed.length,1);
});
test('brief rejects too few, repeated or unsupported requirements',()=>{
 const brief={designDirection:'真人肖像互动伴读礼盒',usageScenario:'家庭伴读',productValue:'学习',emotionalValue:'陪伴',designKeywords:['正式','活力','成就'],assumptions:[],unsupportedConstraints:[],preferences:{title:[],selling:[],subject:[]},hardConstraints:[]};assert.doesNotThrow(()=>validateBriefRules(brief));assert.throws(()=>validateBriefRules({...brief,designKeywords:['正式']}));assert.throws(()=>validateBriefRules({...brief,hardConstraints:[{field:'font',operator:'include',value:'未知字体',evidence:'未知字体'}]}));
});
