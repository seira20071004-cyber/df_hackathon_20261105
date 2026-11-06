import test from 'node:test';
import assert from 'node:assert/strict';
import {cosine,semanticHash} from '../lib/semantic-search.ts';
import {programFixture} from './interactive-fixtures.mjs';
test('semantic index invalidates when a branch, condition or procedure changes',()=>{
  const manual={content:{title:'商品登録',steps:[],cautions:[]},program:programFixture(true)},hash=semanticHash(manual);
  const changed=structuredClone(manual);changed.program.blocks.find(block=>block.type==='branch').question='ランプが点灯していますか？';assert.notEqual(semanticHash(changed),hash);
  const routing=structuredClone(manual);routing.program.blocks.find(block=>block.type==='branch').choices[0].nextBlockId='other';assert.notEqual(semanticHash(routing),hash);
  assert.equal(cosine([1,0],[1,0]),1);assert.equal(cosine([1,0],[0,1]),0);assert.equal(cosine([0,0],[0,0]),-1);assert.equal(cosine([1],[1,2]),-1);
});
