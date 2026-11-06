import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import {normalizeFigures,reorderedAssets,figureSchema} from '../lib/manual-assets.ts';

test('step movement retains matching pictures and citations, changed text drops its picture',()=>{
  const manual={content:{steps:['部屋へ行く','棚を確認する']},imageUrls:['image-a','image-b'],imageLayout:'steps',evidence:{steps:[[{messageId:'a'}],[{messageId:'b'}]]}};
  const moved=reorderedAssets(manual,{steps:['棚を確認する','部屋へ行く']},[1,0]);
  assert.deepEqual(moved.images,['image-b','image-a']);assert.deepEqual(moved.evidence,[[{messageId:'b'}],[{messageId:'a'}]]);assert.equal(moved.unchanged,true);
  assert.deepEqual(reorderedAssets(manual,{steps:['新しい方法','部屋へ行く']},[1,0]).images,['','image-a']);
  assert.deepEqual(reorderedAssets(manual,{steps:['追加した作業']},[-1]).images,[]);
  assert.throws(()=>reorderedAssets(manual,{steps:['部屋へ行く','部屋へ行く']},[0,0]),/invalid-step-order/);
  assert.throws(()=>reorderedAssets(manual,{steps:['部屋へ行く']},[2]),/invalid-step-order/);
});
test('inserted pictures are decoded, normalized and bounded to real step locations',async()=>{
  const bytes=await sharp({create:{width:200,height:100,channels:3,background:'#2768d5'}}).png().toBuffer();
  const figure={id:'00000000-0000-4000-8000-000000000001',afterStep:0,url:'data:image/png;base64,'+bytes.toString('base64'),caption:'保管場所'};
  const result=await normalizeFigures([figure],2);assert.match(result[0].url,/^data:image\/webp;base64,/);
  const metadata=await sharp(Buffer.from(result[0].url.split(',')[1],'base64')).metadata();assert.equal(metadata.width,200);assert.equal(result[0].caption,'保管場所');
  await assert.rejects(normalizeFigures([{...figure,afterStep:2}],2),/invalid-figures/);
  await assert.rejects(normalizeFigures([figure,figure],2),/invalid-figures/);
  await assert.rejects(normalizeFigures([{...figure,url:'data:image/png;base64,YmFk'}],2));
  await assert.rejects(normalizeFigures([{...figure,url:figure.url.replace('image/png','image/jpeg')}],2),/invalid-figures/);
  assert.equal(figureSchema.safeParse({...figure,url:'https://example.com/image.jpg'}).success,false);
  assert.equal(figureSchema.safeParse({...figure,url:'data:image/svg+xml;base64,YmFk'}).success,false);
});
