import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareProtectedSource,hideProtectedText,coversAnswers} from '../lib/protected-source.ts';
import {questionFixture,profile} from './interactive-fixtures.mjs';

test('redaction keeps the original chat, strips translations, and invalidates approval on manual masking',async()=>{
 const previous={...process.env};try{
  process.env.BRIDGE_DEMO='true';process.env.BRIDGE_PRIVACY_STRICT='false';process.env.BRIDGE_SENSITIVE_PROVIDER='local';
  const question=questionFixture();question.originalText='装置X report@example.invalid';question.japaneseText='原文とは違う翻訳';
  const before=structuredClone(question),prepared=await prepareProtectedSource(profile,question,[]);
  assert.equal(prepared.context.question,'装置X [EMAIL]');assert.deepEqual(question,before);
  assert.ok(!JSON.stringify(prepared).includes('原文とは違う翻訳'));
  const masked=hideProtectedText({...prepared,approvedAt:'now',approvedBy:'manager'},0,0,3);
  assert.equal(masked.context.sources[0].text,'[機密情報] [EMAIL]');assert.equal(masked.context.question,masked.context.sources[0].text);
  assert.equal(masked.approvedAt,undefined);
  assert.throws(()=>hideProtectedText(prepared,0,0,1000));
  const answer={id:'supplement-1',answer:'電話は 090-1234-5678',questionId:'gap',round:1,question:'確認',answeredBy:'manager',createdAt:'now'};
  assert.equal(coversAnswers(masked,[answer]),false);
  const refreshed=await prepareProtectedSource(profile,question,[answer],masked);
  assert.equal(coversAnswers(refreshed,[answer]),true);
  assert.ok(!JSON.stringify(refreshed).includes('090-1234-5678'));
  assert.ok(refreshed.context.sources[0].text.startsWith('[機密情報]'));
 }finally{process.env=previous;}
});
test('credentials and missing mandatory inspection cannot produce an approvable copy',async()=>{
 const previous={...process.env};try{
  process.env.BRIDGE_DEMO='true';process.env.BRIDGE_PRIVACY_STRICT='true';process.env.BRIDGE_SENSITIVE_PROVIDER='local';
  const question=questionFixture();assert.equal((await prepareProtectedSource(profile,question,[])).error,'privacy-unavailable');
  question.messages[0].originalText='password: mock-credential';
  const blocked=await prepareProtectedSource(profile,question,[]);
  assert.deepEqual(blocked,{error:'sensitive-input-blocked'});
 }finally{process.env=previous;}
});
