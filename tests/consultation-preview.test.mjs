import test from 'node:test';
import assert from 'node:assert/strict';
import {detectedPreviews} from '../lib/consultation-preview.ts';

test('detects the message language even when its recorded language is Japanese',async()=>{
 const rows=[{id:'english',originalLanguage:'ja',originalText:'Could u teach me how to do cleaning floar.'},{id:'japanese',originalLanguage:'ja',originalText:'残業代について'}];
 const result=await detectedPreviews(rows,'ja',async(texts,target)=>{
  assert.deepEqual(texts,rows.map(row=>row.originalText));assert.equal(target,'ja');
  return ['床の清掃方法を教えてください。',null];
 });
 assert.deepEqual(result,[{id:'english',text:'床の清掃方法を教えてください。'},{id:'japanese',text:'残業代について'}]);
});
test('does not claim success when translation fails',async()=>{
 await assert.rejects(detectedPreviews([{id:'1',originalText:'hello'}],'ja',async()=>{throw new Error('unavailable');}));
});
