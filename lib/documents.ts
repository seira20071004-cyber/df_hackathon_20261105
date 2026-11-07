import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,unlink,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {applicationDefault} from 'firebase-admin/app';
import {getStorage} from 'firebase-admin/storage';
import {z} from 'zod';
import {aiConfigured,generateChecked} from './ai';
import {types} from './adaptive';
import {programSchema,graphIssues,programContent,qualitySchema,qualityIssues} from './manual-graph';
import type {Manual,Profile} from './model';
import {MAX_PDF_BYTES,type PdfCandidate,type SourceDocument} from './document-types';
import {copyPdfPage,parseLayout,validatePdf,type LayoutResponse} from './pdf-layout';
import {bridgeAdmin,demoDataFolder,isDemo,list,mutate,openPublishedManual,staffRecipients} from './storage';
import {audit,securityContext,SecurityError,withAiLimit} from './security-runtime';
import {protectAiData} from './privacy';

const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const now=()=>new Date().toISOString();
const deny=(status:number,code:string):never=>{throw new SecurityError(status,code);};
const validId=(id:string)=>/^[a-f0-9]{64}$/.test(id);
function authorize(profile:Profile,site:string){
 if(profile.role!=='manager'||!profile.siteIds.includes(site))deny(403,'forbidden');
}
const demoFixture=()=>isDemo()&&['test-fixture','fixture-only'].includes(process.env.GEMINI_API_KEY??'');
function original(profile:Profile,site:string,id:string){
 if(!validId(id)||!profile.siteIds.includes(site))return deny(404,'not-found');
 const key=`organizations/${profile.organizationId}/sites/${site}/source-pdf/${id}.pdf`;
 if(isDemo()){
  const directory=join(demoDataFolder,profile.organizationId,site,'source-pdf');
  const filename=join(directory,id+'.pdf');
  return {read:()=>readFile(filename),save:async(bytes:Buffer)=>{await mkdir(directory,{recursive:true});await writeFile(filename,bytes,{flag:'wx'});},remove:async()=>{await unlink(filename).catch(error=>{if(error.code!=='ENOENT')throw error;});}};
 }
 const bucket=process.env.BRIDGE_DOCUMENT_BUCKET;
 if(!bucket)return deny(503,'document-storage-unconfigured');
 const file=getStorage(bridgeAdmin()).bucket(bucket).file(key);
 return {read:async()=>(await file.download())[0],save:async(bytes:Buffer)=>{await file.save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:'application/pdf',cacheControl:'private, no-store'}});},remove:async()=>{await file.delete({ignoreNotFound:true});}};
}
const publicRecord=(row:SourceDocument)=>({...row});
export async function documentList(profile:Profile,site:string){
 authorize(profile,site);
 return (await list(profile,site,'sourceDocuments')).filter(row=>row.state!=='deleted').sort((a,b)=>b.uploadedAt.localeCompare(a.uploadedAt)).map(publicRecord);
}
export async function uploadPdf(profile:Profile,site:string,input:{filename:string;data:string;classification:SourceDocument['classification'];share:boolean}){
 authorize(profile,site);
 if(!/\.pdf$/i.test(input.filename)||!/^([A-Za-z0-9+/]+)={0,2}$/.test(input.data))return deny(400,'invalid-pdf');
 const bytes=Buffer.from(input.data,'base64');
 if(bytes.length>MAX_PDF_BYTES||bytes.toString('base64')!==input.data)return deny(400,'invalid-pdf');
 let pageCount:number;
 try{pageCount=await validatePdf(bytes);}catch(error){return deny(400,error instanceof Error?error.message:'invalid-pdf');}
 const id=sha(bytes),file=original(profile,site,id);
 if((await list(profile,site,'sourceDocuments')).filter(row=>row.state!=='deleted').length>=30)return deny(409,'document-limit');
 const row=await mutate(profile,site,'sourceDocuments',id,previous=>{
  if(previous&&previous.state!=='deleted'&&previous.state!=='upload_failed'&&!(previous.state==='uploading'&&Date.now()-Date.parse(previous.updatedAt)>300_000))return deny(409,'document-duplicate');
  return {id,organizationId:profile.organizationId,siteId:site,filename:input.filename.replace(/[\x00-\x1f\\/]/g,'_'),bytes:bytes.length,pageCount,
   classification:input.classification,allowed:false,share:input.share&&input.classification!=='confidential',
   state:'uploading',uploadedBy:profile.id,uploadedAt:now(),updatedAt:now()};
 });
 try{
  await file.save(bytes).catch(async error=>{const saved=await file.read().catch(()=>null);if(!saved||sha(saved)!==id)throw error;});
 }catch{
  await mutate(profile,site,'sourceDocuments',id,current=>current?.state==='uploading'&&current.updatedAt===row.updatedAt?{...current,state:'upload_failed',updatedAt:now()}:deny(409,'document-state'));
  return deny(503,'document-upload-failed');
 }
 return mutate(profile,site,'sourceDocuments',id,current=>current?.state==='uploading'&&current.updatedAt===row.updatedAt?{...current,state:'stored',updatedAt:now()}:deny(409,'document-state'));
}
export async function documentPermission(profile:Profile,site:string,id:string,allowed:boolean){
 authorize(profile,site);
 return mutate(profile,site,'sourceDocuments',id,row=>{
  if(!row||!['stored','failed','ready'].includes(row.state))return deny(409,'document-state');
  if(allowed&&row.classification==='confidential'&&(isDemo()||process.env.BRIDGE_ALLOW_CONFIDENTIAL_PDF!=='true'))return deny(403,'confidential-disabled');
  return {...row,allowed,updatedAt:now()};
 });
}
export async function queueDocument(profile:Profile,site:string,id:string){
 authorize(profile,site);
 if(!aiConfigured()||!demoFixture()&&(process.env.BRIDGE_DOCUMENT_AI_APPROVED!=='true'||!process.env.BRIDGE_DOCUMENT_PROCESSOR||!process.env.BRIDGE_DOCUMENT_BUCKET))return deny(503,'document-ai-unconfigured');
 return mutate(profile,site,'sourceDocuments',id,row=>{
  if(!row?.allowed||row.classification==='confidential'&&(isDemo()||process.env.BRIDGE_ALLOW_CONFIDENTIAL_PDF!=='true'))return deny(403,'document-ai-denied');
  if(!['stored','failed'].includes(row.state)&&!(row.state==='processing'&&Date.now()-Date.parse(row.updatedAt)>300_000))return deny(409,'document-state');
  return {...row,state:'processing',attempt:randomUUID(),updatedAt:now(),estimatedLayoutUsd:demoFixture()?0:row.pageCount*.01};
 });
}
async function layout(bytes:Buffer){
 if(demoFixture()){
  const fixture=await readFile(join(process.cwd(),'public','sample-work-manual.pdf'));
  if(sha(bytes)!==sha(fixture))throw new Error('demo-fixture-only');
  return {document:{documentLayout:{blocks:[{blockId:'title',pageSpan:{pageStart:1,pageEnd:1},textBlock:{type:'heading-1',text:'Entrance mat inspection'}},{blockId:'figure',pageSpan:{pageStart:1,pageEnd:1},imageBlock:{}}]},
   chunkedDocument:{chunks:[{content:'Entrance mat inspection\nCheck whether the mat edges lie flat. If an edge is curled, contact your manager.',sourceBlockIds:['title','figure'],pageSpan:{pageStart:1,pageEnd:1}}]}}};
 }
 const resource=process.env.BRIDGE_DOCUMENT_PROCESSOR??'';
 const match=/^projects\/[a-zA-Z0-9-]+\/locations\/(us|eu)\/processors\/[a-z0-9]+\/processorVersions\/[a-zA-Z0-9._-]+$/.exec(resource);
 if(!match)throw new Error('document-processor-unconfigured');
 const credential=await applicationDefault().getAccessToken();
 const response=await withAiLimit(()=>fetch(`https://${match[1]}-documentai.googleapis.com/v1beta3/${resource}:process`,{
  method:'POST',signal:AbortSignal.timeout(65_000),headers:{Authorization:'Bearer '+credential.access_token,'Content-Type':'application/json'},
  body:JSON.stringify({rawDocument:{content:bytes.toString('base64'),mimeType:'application/pdf'},processOptions:{layoutConfig:{chunkingConfig:{chunkSize:400,includeAncestorHeadings:true}}}})
 }));
 if(!response.ok)throw new Error('document-layout-failed');
 return await response.json() as LayoutResponse;
}
const proposal=z.object({candidates:z.array(z.object({program:programSchema,type:z.enum(types),
 conditions:z.string().max(500),exclusions:z.string().max(500),questions:z.array(z.string().max(240)).max(6),
 evidence:z.array(z.object({blockId:z.string(),chunkId:z.string(),quote:z.string().min(1).max(500)})).max(60)})).max(6)});
export async function processDocument(profile:Profile,queued:SourceDocument){
 return securityContext.run(profile,async()=>{
  const {siteId,id}=queued;
  const update=(changes:Partial<SourceDocument>)=>mutate(profile,siteId,'sourceDocuments',id,current=>{
   if(!current||current.attempt!==queued.attempt||current.state!=='processing')return deny(409,'document-state');
   return {...current,...changes,updatedAt:now()};
  });
  try{
   const raw=await original(profile,siteId,id).read();
   if(sha(raw)!==id)throw new Error('document-integrity');
   const chunks=await protectAiData(parseLayout(await layout(raw),queued.pageCount));
   if(!chunks.length)throw new Error('document-no-text');
   const generated=await generateChecked(proposal,'PDFの保護済みチャンクから独立した業務の候補を日本語で作る。根拠のない手順は作らない。各ブロックにchunkIdと原文の逐語引用を付ける。図の意味が不明なら確認事項にする。操作権限が必要な危険手順は生成しない。条件分岐の遷移先は実在IDかnull。説明のみなら候補を空にしてよい。',{chunks});
   const candidates:PdfCandidate[]=[];
   for(const {evidence,...candidate} of generated.candidates){
    if(candidate.program.language!=='ja'||graphIssues(candidate.program).length)continue;
    if(candidate.program.blocks.some(block=>block.type==='step'&&block.restricted||!block.sourceMessageIds.length||
     block.sourceMessageIds.some(chunkId=>!evidence.some(row=>row.blockId===block.id&&row.chunkId===chunkId&&chunks.some(chunk=>chunk.id===chunkId&&chunk.text.includes(row.quote))))))continue;
    const quality=await generateChecked(qualitySchema,'候補の全手順を根拠チャンクと照合し、記載されていない操作・条件や図の推測を不合格にする。各ブロックを1回だけ評価する。',{chunks,candidate:candidate.program});
    if(!qualityIssues(candidate.program,quality).length){
     const accepted={...candidate,evidence:evidence.filter(row=>candidate.program.blocks.some(block=>block.id===row.blockId&&block.sourceMessageIds.includes(row.chunkId)))};
     if(Buffer.byteLength(JSON.stringify({chunks,candidates:[...candidates,accepted]}),'utf8')<=650_000)candidates.push(accepted);
    }
   }
   await update({state:'ready',chunks,candidates});
   await audit({actorId:profile.id,organizationId:profile.organizationId,action:'document_processed',resourceId:id,result:'success'});
  }catch(error){
   const code=error instanceof Error&&/^(document-[a-z-]+|demo-fixture-only|privacy-unavailable|sensitive-input-blocked|quota|invalid-json)$/.test(error.message)?error.message:'document-processing-failed';
   await update({state:'failed',error:code}).catch(()=>undefined);
   await audit({actorId:profile.id,organizationId:profile.organizationId,action:'document_processed',resourceId:id,result:'failed',code}).catch(()=>undefined);
  }
 });
}
export async function materializeDocument(profile:Profile,site:string,id:string,index:number,kind:'candidate'|'chunk'){
 authorize(profile,site);
 const manualId=`source-${id}-${kind}-${index}`;
 const row=await mutate(profile,site,'sourceDocuments',id,current=>{
  if(!current||current.state!=='ready'||!(kind==='candidate'?current.candidates?.[index]:current.chunks?.[index]))return deny(404,'not-found');
  return {...current,linked:[...new Set([...(current.linked??[]),manualId])],updatedAt:now()};
 });
 const candidate=kind==='candidate'?row.candidates?.[index]:undefined,chunk=kind==='chunk'?row.chunks?.[index]:undefined;
 const references=(chunk?[chunk]:row.chunks!.filter(item=>candidate!.program.blocks.some(block=>block.sourceMessageIds.includes(item.id)))).map(({text,...item})=>item);
 const title=chunk?(chunk.heading||'原本の参照情報').slice(0,120):candidate!.program.title;
 const content=chunk?{title,task:title,purpose:'原本の抜粋',steps:chunk.text.match(/[\s\S]{1,480}/gu)?.slice(0,12)??[],tools:[],cautions:[],mistakes:[],checks:[]}:programContent(candidate!.program);
 return mutate(profile,site,'manuals',manualId,previous=>previous??{
  id:manualId,siteId:site,organizationId:profile.organizationId,status:'draft',reviewState:'pending_approval',approvedBy:null,
  createdAt:now(),updatedAt:now(),revision:1,sourceQuestionIds:[],sourceDocument:{id,share:row.share,references,...(candidate?{conditions:candidate.conditions,exclusions:candidate.exclusions}:{})},
  content,languages:['ja'],translations:{},imageUrls:[],
  access:{level:'INTERNAL',allowedRoles:row.share?['manager','employee']:['manager'],allowedUserIds:[]},
  ...(candidate?{program:candidate.program,consultationType:candidate.type}:{}),
 });
}
export async function directManual(profile:Profile,site:string,title:string){
 authorize(profile,site);
 const id=randomUUID();
 const program=programSchema.parse({title,description:'',language:'ja',startBlockId:'step',blocks:[
  {id:'step',type:'step',title:'手順',content:'内容を編集してください。',supplement:'',restricted:false,authorizationSourceMessageIds:[],sourceMessageIds:[],nextBlockId:'complete'},
  {id:'complete',type:'check',content:'完了条件を入力してください。',sourceMessageIds:[],successNextBlockId:null,failureNextBlockId:null}
 ]});
 return mutate(profile,site,'manuals',id,()=>({id,siteId:site,organizationId:profile.organizationId,status:'draft',reviewState:'pending_approval',approvedBy:null,authored:true,
  createdAt:now(),updatedAt:now(),sourceQuestionIds:[],content:programContent(program),program,languages:['ja'],translations:{},imageUrls:[]}));
}
export async function documentDownload(profile:Profile,site:string,id:string,manualId?:string,version?:string,page?:number){
 if(!profile.siteIds.includes(site))return deny(404,'not-found');
 if(profile.role!=='manager'){
  if(!manualId||!version)return deny(404,'not-found');
  const manual=await openPublishedManual(profile,site,manualId,version).catch(()=>null);
  if(!manual?.sourceDocument?.share||manual.sourceDocument.id!==id||page!==undefined&&!manual.sourceDocument.references.some(ref=>page>=ref.pageStart&&page<=ref.pageEnd))return deny(404,'not-found');
 }
 const row=(await list(profile,site,'sourceDocuments')).find(item=>item.id===id);
 if(!row||['uploading','upload_failed','deleted','deleting'].includes(row.state)||profile.role!=='manager'&&!row.share)return deny(404,'not-found');
 const data=await original(profile,site,id).read();
 if(sha(data)!==id)return deny(409,'document-integrity');
 if(page!==undefined){
  if(page<1||page>row.pageCount)return deny(404,'not-found');
  return {data:await copyPdfPage(data,page),filename:`source-p${page}.pdf`};
 }
 return {data,filename:row.filename};
}
export async function deleteDocument(profile:Profile,site:string,id:string){
 authorize(profile,site);
 const file=original(profile,site,id);
 const row=await mutate(profile,site,'sourceDocuments',id,current=>{
  if(!current||current.state==='deleted')return deny(404,'not-found');
  if(current.linked?.length)return deny(409,'document-in-use');
  if(['uploading','processing'].includes(current.state)||current.state==='deleting'&&Date.now()-Date.parse(current.updatedAt)<300_000)return deny(409,'document-state');
  return {...current,state:'deleting',updatedAt:now()};
 });
 await file.remove();
 await mutate(profile,site,'sourceDocuments',id,current=>current?.state==='deleting'&&current.updatedAt===row.updatedAt?{...current,filename:'',state:'deleted',allowed:false,share:false,chunks:[],candidates:[],updatedAt:now()}:deny(409,'document-state'));
 return {ok:true};
}
