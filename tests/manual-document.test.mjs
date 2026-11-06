import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {A4,fitA4Content,jpeg300Dpi,singlePagePdf} from '../lib/manual-document.ts';

test('PDF remains exactly one A4 page for short and long manuals',async()=>{
  const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#1256c9'}}).jpeg().toBuffer();
  const data='data:image/jpeg;base64,'+bytes.toString('base64');
  for(const [width,height] of [[1588,2246],[1588,9000],[100,100000]]){
    const pdf=await singlePagePdf(data,width,height,'manual');
    assert.equal(pdf.getNumberOfPages(),1);
    const w=pdf.internal.pageSize.getWidth(),h=pdf.internal.pageSize.getHeight();
    assert.ok(Math.abs(w-210)<.01);assert.ok(Math.abs(h-297)<.01);
    assert.match(pdf.output(),/\/Count 1\b/);
  }
  await assert.rejects(singlePagePdf(data,0,500,'manual'),/invalid-page-size/);
});
test('A4 print content stays within margins and JPEG has 300 dpi print density',async()=>{
  for(const height of [300,980,5000,20000]){const fit=fitA4Content(height);assert.ok(fit.y+fit.scale*height<=A4.height-32+.001);assert.ok(fit.x>=0);}
  const source=await sharp({create:{width:A4.pixelWidth,height:A4.pixelHeight,channels:3,background:'#fff'}}).jpeg().toBuffer();
  const result=jpeg300Dpi(new Uint8Array(source));const metadata=await sharp(result).metadata();
  assert.equal(metadata.width,2480);assert.equal(metadata.height,3508);assert.equal(metadata.density,300);
  assert.throws(()=>jpeg300Dpi(new Uint8Array([1,2,3])),/invalid-jpeg/);
});
