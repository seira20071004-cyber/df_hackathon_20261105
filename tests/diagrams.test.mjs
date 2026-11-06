import assert from 'node:assert/strict';
import test from 'node:test';
import { stairRange } from '../lib/diagrams.ts';

test('stair diagrams use explicit unambiguous floor ranges',()=>{
  assert.deepEqual(stairRange('1階から3階までの階段と踊り場が対象です。'),{
    kind:'stair-range',fromFloor:1,toFloor:3,includeLandings:true
  });
  assert.equal(stairRange('階段は１〜３階が対象です。').toFloor,3);
  assert.equal(stairRange('2階から4階の階段を清掃します。').includeLandings,false);
  for(const source of [
    '階段を清掃します。','階段は3階から1階までです。','地下1階から3階の階段です。',
    '階段は1階から3階と5階から7階です。','1階から3階の階段です。踊り場は含めません。',
    '階段は1階から99階まで。','洗剤は1階から3階の倉庫にあります。'
  ]) assert.equal(stairRange(source),undefined,source);
});
