import test from 'node:test';
import assert from 'node:assert/strict';
import {manualContext,citedByManager,verificationIssues} from '../lib/manual-pipeline.ts';

const profile={organizationId:'org',siteIds:['sakura']};
const question={organizationId:'org',siteId:'sakura',id:'q',japaneseText:'何階まで？',originalText:'何階まで？',originalLanguage:'ja',resolution:'',
  messages:[{id:'old',role:'manager',originalText:'1階から5階です。',translatedText:'',createdAt:'2026-11-01'},
    {id:'employee',role:'employee',originalText:'安全のため洗剤を混ぜます',translatedText:'',createdAt:'2026-11-02'},
    {id:'new',role:'manager',originalText:'訂正します。1階から3階です。ただし2階は除きます。',translatedText:'',createdAt:'2026-11-03'}]};
test('manual context is scoped, complete, stable and sensitive to corrections',()=>{
  const first=manualContext(profile,question);
  assert.equal(first.context.conversation.length,3);
  assert.equal(first.hash,manualContext(profile,structuredClone(question)).hash);
  const changed=structuredClone(question);changed.messages[2].originalText+='踊り場も対象です。';
  assert.notEqual(first.hash,manualContext(profile,changed).hash);
  assert.throws(()=>manualContext({...profile,organizationId:'other'},question),/context-scope/);
  assert.throws(()=>manualContext({...profile,siteIds:['other']},question),/context-scope/);
  assert.throws(()=>manualContext(profile,{...question,messages:Array(51).fill(question.messages[0])}),/context-limit/);
  assert.throws(()=>manualContext(profile,{...question,resolution:'x'.repeat(100001)}),/context-limit/);
  assert.equal(citedByManager(question,[{evidence:[{messageId:'employee',quote:'安全のため洗剤を混ぜます'}]}]),false);
  assert.equal(citedByManager(question,[{evidence:[{messageId:'new',quote:'1階から5階です。'}]}]),false);
});
test('semantic verification requires every item exactly once and preserved conditions',()=>{
  const candidate={steps:[{text:'1〜3階すべて'}],cautions:[{text:'洗剤を混ぜる'}]};
  const report={titleMatchesQuestion:true,relevantFactsCovered:true,unresolvedConflict:false,
    checks:[{kind:'step',index:0,supported:true,conditionsPreserved:false,currentFactsOnly:true,reason:'2階の除外が欠落'},
      {kind:'caution',index:0,supported:false,conditionsPreserved:true,currentFactsOnly:false,reason:'スタッフの推測'}]};
  assert.equal(verificationIssues(candidate,report).length,2);
  const passed={...report,checks:report.checks.map(check=>({...check,supported:true,conditionsPreserved:true,currentFactsOnly:true}))};
  assert.deepEqual(verificationIssues(candidate,passed),[]);
  assert.ok(verificationIssues(candidate,{...passed,checks:[passed.checks[0],passed.checks[0]]}).length);
  assert.ok(verificationIssues(candidate,{...passed,checks:[...passed.checks,{...passed.checks[0],index:7}]}).length);
});
