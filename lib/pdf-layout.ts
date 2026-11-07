import {PDFArray,PDFDict,PDFDocument,PDFName,PDFRawStream,type PDFObject} from 'pdf-lib';
import {MAX_PDF_BYTES,MAX_PDF_PAGES,type PdfChunk} from './document-types.ts';

export async function validatePdf(bytes:Buffer){
 if(bytes.length>MAX_PDF_BYTES||!/^%PDF-1\.[0-9]|^%PDF-2\.0/.test(bytes.subarray(0,8).toString('ascii'))||
    !/%%EOF\s*$/.test(bytes.subarray(-1024).toString('latin1')))throw new Error('invalid-pdf');
 const pdf=await PDFDocument.load(bytes,{throwOnInvalidObject:true,updateMetadata:false}).catch(()=>{throw new Error('invalid-pdf');});
 const pages=pdf.getPageCount();
 if(pages<1||pages>MAX_PDF_PAGES)throw new Error('pdf-page-limit');
 const forbidden=new Set(['/JS','/JavaScript','/Launch','/EmbeddedFile','/EmbeddedFiles','/EF','/RichMedia','/XFA','/OpenAction','/AA']);
 function containsAction(object:PDFObject,depth=0):boolean{
  if(depth>35)return true;
  if(object instanceof PDFName)return forbidden.has(object.toString());
  if(object instanceof PDFRawStream)return containsAction(object.dict,depth+1);
  if(object instanceof PDFDict)return object.entries().some(([key,value])=>containsAction(key,depth+1)||containsAction(value,depth+1));
  if(object instanceof PDFArray)return object.asArray().some(value=>containsAction(value,depth+1));
  return false;
 }
 if(pdf.context.enumerateIndirectObjects().some(([,object])=>containsAction(object)))throw new Error('active-pdf');
 return pages;
}

export async function copyPdfPage(bytes:Buffer,page:number){
 const source=await PDFDocument.load(bytes,{updateMetadata:false});
 if(!Number.isInteger(page)||page<1||page>source.getPageCount())throw new Error('invalid-page');
 const result=await PDFDocument.create();
 const [selected]=await result.copyPages(source,[page-1]);
 result.addPage(selected);
 return Buffer.from(await result.save());
}

type Span={pageStart?:number;pageEnd?:number};
type LayoutBlock={blockId?:string;pageSpan?:Span;textBlock?:{text?:string;type?:string;blocks?:LayoutBlock[]};tableBlock?:unknown;imageBlock?:unknown;listBlock?:unknown};
export type LayoutResponse={document?:{documentLayout?:{blocks?:LayoutBlock[]};chunkedDocument?:{chunks?:{content?:string;pageSpan?:Span;sourceBlockIds?:string[];chunkFields?:{imageChunkField?:unknown;tableChunkField?:unknown}[]}[]}}};
export function parseLayout(data:LayoutResponse,pages:number):PdfChunk[]{
 const blocks=new Map<string,{heading:string}>();
 const visual=new Map<number,{figure:boolean;table:boolean}>();
 let heading='';
 const headings=new Map<number,string>();
 function visit(rows:LayoutBlock[],depth=0){
  if(depth>20)return;
  for(const row of rows){
   if(/^(heading-|subtitle$|title$)/.test(row.textBlock?.type??'')){
    heading=(row.textBlock?.text??'').slice(0,150);
    if(row.pageSpan?.pageStart&&heading)headings.set(row.pageSpan.pageStart,heading);
   }
   if(row.blockId)blocks.set(row.blockId,{heading});
   if(row.tableBlock||row.imageBlock){
    const start=row.pageSpan?.pageStart??0,end=row.pageSpan?.pageEnd??start;
    for(let page=Math.max(1,start);page<=Math.min(pages,end);page++){
     const prior=visual.get(page);visual.set(page,{figure:Boolean(row.imageBlock||prior?.figure),table:Boolean(row.tableBlock||prior?.table)});
    }
   }
   if(row.textBlock?.blocks)visit(row.textBlock.blocks,depth+1);
  }
 }
 visit(data.document?.documentLayout?.blocks??[]);
 return (data.document?.chunkedDocument?.chunks??[]).flatMap((row,index)=>{
  const pageStart=row.pageSpan?.pageStart,pageEnd=row.pageSpan?.pageEnd??pageStart;
  if(!pageStart||!pageEnd||!Number.isInteger(pageStart)||!Number.isInteger(pageEnd)||pageStart<1||pageEnd<pageStart||pageEnd>pages||typeof row.content!=='string'||!row.content.trim())return [];
  const flags=Array.from({length:pageEnd-pageStart+1},(_,offset)=>visual.get(pageStart+offset));
  return [{id:'pdf-'+(index+1),pageStart,pageEnd,heading:(row.sourceBlockIds??[]).map(id=>blocks.get(id)?.heading).find(Boolean)??headings.get(pageStart)??'',
   figure:flags.some(flag=>flag?.figure)||Boolean(row.chunkFields?.some(field=>field.imageChunkField)),table:flags.some(flag=>flag?.table)||Boolean(row.chunkFields?.some(field=>field.tableChunkField)),text:row.content.trim().slice(0,3000)}];
 }).slice(0,30);
}
