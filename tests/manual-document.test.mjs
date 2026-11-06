import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {singlePagePdf} from '../lib/manual-document.ts';

test('PDF is one page for short and long manuals and retains sheet aspect ratio',async()=>{
  const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#1256c9'}}).jpeg().toBuffer();
  const data='data:image/jpeg;base64,'+bytes.toString('base64');
  for(const [width,height] of [[1588,2246],[1588,9000],[100,100000]]){
    const pdf=await singlePagePdf(data,width,height,'manual');
    assert.equal(pdf.getNumberOfPages(),1);
    const w=pdf.internal.pageSize.getWidth(),h=pdf.internal.pageSize.getHeight();
    assert.ok(h<=5000.01);assert.ok(Math.abs(w/h-width/height)<.00001);
    assert.match(pdf.output(),/\/Count 1\b/);
  }
  await assert.rejects(singlePagePdf(data,0,500,'manual'),/invalid-page-size/);
});
