import test from 'node:test';
import assert from 'node:assert/strict';
import {analysisSchema,applicableIds,compatibleCodes,intakeSources,nextClarification,reconcileAnalysis} from '../lib/adaptive.ts';
const cases=[
 ['バーコードが読み取れない','troubleshooting','normal'],['レジの画面が固まった','troubleshooting','normal'],
 ['返金を求められた','procedure','normal'],['電子決済が失敗する','troubleshooting','normal'],
 ['注文がキッチンに届かない','troubleshooting','normal'],['アレルギー対応が必要','procedure','caution'],
 ['冷蔵庫の温度が高い','troubleshooting','caution'],['シフトを変更したい','procedure','normal'],
 ['工場の機械から異音がする','troubleshooting','caution'],['製品に傷がある','procedure','normal'],
 ['作業指示書が理解できない','information_support','normal'],['薬品がこぼれた','troubleshooting','emergency'],
 ['どの洗剤を使うか分からない','work_instruction','normal'],['清掃場所が分からない','work_instruction','normal'],
 ['清掃機器が動かない','troubleshooting','normal'],['荷物の配送先が分からない','information_support','normal'],
 ['在庫数が合わない','troubleshooting','normal'],['フォークリフトの警告灯が点いた','troubleshooting','caution'],
 ['社内Wi-Fiにつながらない','troubleshooting','normal'],['共有ファイルにアクセスできない','troubleshooting','normal']
];
for(const [text,primary,risk] of cases)test('mock routing: '+text,()=>{
 const source={id:'input',text},mock=analysisSchema.parse({primary,risk:'normal',secondary:[],facts:[{field:'symptom',state:'confirmed',value:text,sourceId:'input',quote:text}],question:{field:'target',text:'対象は何ですか？',options:[]}});
 const result=reconcileAnalysis(mock,[source]);
 assert.equal(result.primary,primary);assert.equal(result.risk,risk);
 assert.equal(result.facts[0].value,text);assert.equal(Boolean(nextClarification(result,[])),risk==='normal');
 assert.equal(nextClarification(result,['target']),null);
});
test('no model result stays unknown; English, Vietnamese and configured hazards override a model',()=>{
 const local=text=>reconcileAnalysis(null,[{id:'input',text}]).risk;
 assert.equal(local('unknown issue'),'unknown');assert.equal(local('chemical spill'),'emergency');assert.equal(local('hóa chất bị đổ'),'emergency');
 assert.equal(reconcileAnalysis(null,[{id:'input',text:'Zone X'}],['zone x']).risk,'caution');
});
test('confirmed evidence is literal; no repeated or fourth question',()=>{
 const input={primary:'procedure',secondary:['procedure','work_instruction','work_instruction'],risk:'normal',facts:[{field:'target',state:'confirmed',value:'password',quote:'invented',sourceId:'input'}],question:{field:'result',text:'どうなりましたか？',options:[]}};
 const value=reconcileAnalysis(analysisSchema.parse(input),[{id:'input',text:'シフト'}]);
 assert.equal(value.facts[0].state,'inferred');assert.equal(value.facts[0].sourceId,'');assert.deepEqual(value.secondary,['work_instruction']);
 assert.equal(nextClarification(value,['target','symptom','attempt']),null);
});
test('photo observations never confirm facts and local danger retains its evidence',()=>{
 const ai=analysisSchema.parse({primary:'troubleshooting',secondary:[],risk:'normal',facts:[{field:'target',state:'confirmed',value:'Scanner',quote:'Scanner',sourceId:'photo:test'}],question:null});
 const value=reconcileAnalysis(ai,[{id:'photo:test',text:'Scanner'},{id:'input',text:'chemical spill'}]);
 assert.equal(value.facts[0].state,'inferred');
 assert.equal(value.risk,'emergency');assert.deepEqual(value.riskEvidence,[{sourceId:'input',quote:'chemical spill'}]);
});
test('skipping an intake question preserves its slot without supplying a fact',()=>{
 const answers=[{field:'target',text:'わからない',unknown:true},{field:'error',text:'E-101'}];
 assert.deepEqual(intakeSources(answers),[{id:'intake:1',text:'E-101'}]);
 const analysis=reconcileAnalysis(analysisSchema.parse({primary:'troubleshooting',secondary:[],risk:'normal',facts:[],
  question:{field:'target',text:'対象は何ですか？',options:[]}}),[]);
 assert.equal(nextClarification(analysis,answers.map(answer=>answer.field)),null);
});
test('unknown IDs, duplicates, conditional, inapplicable and unsafe entries never pass',()=>{
 const ratings=[{id:'outside',verdict:'applicable'},{id:'yes',verdict:'applicable'},{id:'maybe',verdict:'needs_clarification'},{id:'duplicate',verdict:'applicable'},{id:'duplicate',verdict:'unsafe'},{id:'wrong',verdict:'not_applicable'}];
 assert.deepEqual(applicableIds(ratings,['yes','maybe','duplicate','wrong']),['yes']);
 assert.equal(compatibleCodes('ERR-103','ERR 103'),true);assert.equal(compatibleCodes('E-101','E-102'),false);
});
