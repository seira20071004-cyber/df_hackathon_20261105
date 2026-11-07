import assert from 'node:assert/strict';
import test from 'node:test';
import {PDFDocument} from 'pdf-lib';
import {validatePdf,copyPdfPage,parseLayout} from '../lib/pdf-layout.ts';

async function pdf(pages,action=false){
 const document=await PDFDocument.create();
 for(let i=0;i<pages;i++)document.addPage();
 if(action)document.addJavaScript('auto','app.alert("test")');
 return Buffer.from(await document.save());
}
test('PDF validation and page copies preserve page limits and reject active content',async()=>{
 const original=await pdf(3);
 assert.equal(await validatePdf(original),3);
 assert.equal(await validatePdf(await copyPdfPage(original,2)),1);
 await assert.rejects(copyPdfPage(original,4),/invalid-page/);
 await assert.rejects(validatePdf(await pdf(11)),/pdf-page-limit/);
 await assert.rejects(validatePdf(await pdf(1,true)),/active-pdf/);
 await assert.rejects(validatePdf(Buffer.from('file.pdf')),/invalid-pdf/);
});
test('Layout Parser chunk fixtures preserve separate tasks, visual flags and page references',()=>{
 const span=(pageStart,pageEnd=pageStart)=>({pageStart,pageEnd});
 const response={document:{documentLayout:{blocks:[
  {pageSpan:span(1),textBlock:{type:'heading-1',text:'Opening'}},
  {pageSpan:span(2),textBlock:{type:'heading-1',text:'Cleaning'}},
  {pageSpan:span(2),tableBlock:{}},
 ]},chunkedDocument:{chunks:[
  {content:'Open the shutter.',pageSpan:span(1)},
  {content:'Scan transcription: Wipe the table.',pageSpan:span(2),chunkFields:[{imageChunkField:{}}]},
  {content:'  ',pageSpan:span(2)},
  {content:'Outside the PDF',pageSpan:span(3)}
 ]}}};
 const result=parseLayout(response,2);
 assert.deepEqual(result.map(({heading,figure,table,pageStart})=>({heading,figure,table,pageStart})),[
  {heading:'Opening',figure:false,table:false,pageStart:1},
  {heading:'Cleaning',figure:true,table:true,pageStart:2},
 ]);
 assert.deepEqual(parseLayout({document:{documentLayout:{blocks:[]}}},1),[]);
});
