import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {PDFDocument} from 'pdf-lib';
import sharp from 'sharp';
import {seedDemo} from '../lib/demo.ts';

test('SDK pipeline, supplements, approval, sessions and escalation remain scoped and durable',{timeout:120000},async t=>{
 const root=fileURLToPath(new URL('../',import.meta.url));await mkdir(join(root,'.bridge-work'),{recursive:true});
 const folder=await mkdtemp(join(root,'.bridge-work','manual-test-'));const seed={...seedDemo(),manualViews:[],manualDeliveries:[],manualUses:[]};
 seed.manuals.push({...structuredClone(seed.manuals[0]),id:'foreign-manual',organizationId:'other-company',content:{...seed.manuals[0].content,title:'他組織だけの秘密情報'}});
 await writeFile(join(folder,'data.json'),JSON.stringify(seed));
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,['--import',new URL('./provider-mock.mjs',import.meta.url).href,join(root,'node_modules/next/dist/bin/next'),...(process.env.BRIDGE_TEST_DEV==='true'?['dev','--webpack']:['start']),'-H','127.0.0.1','-p',String(port)],{cwd:root,env:{...process.env,BRIDGE_DEMO:'true',BRIDGE_PRIVACY_STRICT:'false',BRIDGE_SENSITIVE_PROVIDER:'local',GEMINI_API_KEY_SECRET:'',GEMINI_API_KEY_FILE:'',BRIDGE_ALLOW_PUBLIC_DEMO:'true',BRIDGE_USER_REQUESTS_PER_MINUTE:'10000',BRIDGE_ORG_REQUESTS_PER_MINUTE:'20000',BRIDGE_AI_CALLS_PER_MINUTE:'10000',BRIDGE_DEMO_DATA_DIR:folder,GEMINI_API_KEY:'test-fixture',GEMINI_PROVIDER:'developer',GOOGLE_GENAI_USE_VERTEXAI:'false',GEMINI_GENERATE_IMAGES:'false',GEMINI_EMBEDDING_MODEL:'test-embedding',BRIDGE_AI_PHOTO_ENABLED:'true'},stdio:['ignore','pipe','pipe']});
 let log='';child.stdout.on('data',data=>log+=data);child.stderr.on('data',data=>log+=data);
 t.after(async()=>{if(child.exitCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;}await rm(folder,{recursive:true,force:true});});
 const url='http://127.0.0.1:'+port+'/api/bridge';let ready=false;
 for(let i=0;i<180;i++){ready=await fetch(url+'?config').then(response=>response.ok).catch(()=>false);if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready,log);
 async function api(actor,input,status=200){const response=await fetch(url,{method:input?'POST':'GET',headers:{Authorization:'Bearer '+actor,'Content-Type':'application/json'},body:input?JSON.stringify({siteId:'sakura',...input}):undefined});const result=await response.json();assert.equal(response.status,status,JSON.stringify(result)+'\n'+log);return result;}
 async function approve(id,answerCount=0){
  let row;for(let i=0;i<100;i++){row=(await api('sato')).manuals.find(item=>item.id===id);if(row?.protectedSource?.context?.sources.filter(source=>source.role==='manager_supplement').length===answerCount)break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal(row.generation.state,'held');assert.equal(row.pipeline?.verification==='passed',false);
  await api('linh',{action:'approveSource',id,version:row.updatedAt,confirmed:true},403);
  await api('sato',{action:'approveSource',id,version:row.updatedAt,confirmed:false},400);
  return api('sato',{action:'approveSource',id,version:row.updatedAt,confirmed:true});
 }
 async function resolveQuestion(title){const id=randomUUID();await api('linh',{action:'ask',id,text:title,language:'ja'});await api('sato',{action:'reply',id,messageId:randomUUID(),text:'汚れを目で確認し、乾いた布で拭いてください。商品名が表示されたら解決です。'});
  const before=Date.now();await api('linh',{action:'resolve',id});assert.ok(Date.now()-before<2000,'Resolution must not wait for Gemini');await api('linh',{action:'resolve',id});
  const matches=(await api('sato')).manuals.filter(manual=>manual.sourceQuestionIds.includes(id));assert.equal(matches.length,1);assert.equal(matches[0].program,undefined);await approve(matches[0].id);return {id,manual:matches[0]};}
 async function completed(id){let manual;for(let i=0;i<150;i++){manual=(await api('sato')).manuals.find(row=>row.id===id);if(['ready','failed','held','awaiting_answers'].includes(manual.generation?.state))return manual;await new Promise(resolve=>setTimeout(resolve,100));}assert.fail(JSON.stringify(manual)+'\n'+log);}
 const pdf=await readFile(join(root,'public','sample-work-manual.pdf'));
 const upload={action:'uploadPdf',filename:'sample.pdf',data:pdf.toString('base64'),classification:'internal',share:true};
 await api('linh',upload,403);await api('sato',{...upload,data:Buffer.from('not a pdf').toString('base64')},400);
 const sourcePdf=await api('sato',upload);assert.equal(sourcePdf.pageCount,1);await api('sato',upload,409);
 await api('sato',{action:'processPdf',id:sourcePdf.id},403);
 await api('sato',{action:'documentPermission',id:sourcePdf.id,allowed:true});
 await api('sato',{action:'processPdf',id:sourcePdf.id});
 let imported;for(let i=0;i<60;i++){imported=(await api('sato',{action:'documentList'})).find(row=>row.id===sourcePdf.id);if(imported.state!=='processing')break;await new Promise(resolve=>setTimeout(resolve,120));}
 assert.equal(imported.state,'ready',JSON.stringify(imported));assert.ok(imported.chunks[0].figure);assert.ok(imported.candidates.length);
 const importedManual=await api('sato',{action:'materializePdf',id:sourcePdf.id,index:0,kind:'candidate'});
 await api('linh',{action:'viewManual',id:importedManual.id,version:importedManual.updatedAt},404);
 const publishedPdf=await api('sato',{action:'saveProgram',id:importedManual.id,version:importedManual.updatedAt,program:importedManual.program,publish:true,confirmPermissions:true});
 const publishedSearch=await api('linh',{action:'adaptiveSearch',text:'入口マットの確認',language:'ja',answers:[]});assert.ok(publishedSearch.matches.some(row=>row.id===publishedPdf.id));
 const pdfUrl=url+'?sourcePdf='+sourcePdf.id+'&site=sakura';
 assert.equal((await fetch(pdfUrl,{headers:{Authorization:'Bearer linh'}})).status,404);
 const download=await fetch(pdfUrl+'&manual='+publishedPdf.id+'&version='+encodeURIComponent(publishedPdf.updatedAt),{headers:{Authorization:'Bearer linh'}});
 assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdf);
 const sourcePage=pdfUrl+'&manual='+publishedPdf.id+'&version='+encodeURIComponent(publishedPdf.updatedAt);
 const onePage=await fetch(sourcePage+'&page=1',{headers:{Authorization:'Bearer linh'}});assert.equal(onePage.status,200);assert.match(onePage.headers.get('content-disposition'),/source-p1\.pdf/);
 assert.equal((await fetch(sourcePage+'&page=2',{headers:{Authorization:'Bearer linh'}})).status,404);
 await api('sato',{action:'deletePdf',id:sourcePdf.id},409);
 const confidential=await PDFDocument.create();confidential.addPage();
 const privatePdf=await api('sato',{...upload,classification:'confidential',data:Buffer.from(await confidential.save()).toString('base64')});
 assert.equal(privatePdf.share,false);
 await api('sato',{action:'documentPermission',id:privatePdf.id,allowed:true},403);
 await api('sato',{action:'deletePdf',id:privatePdf.id});
 assert.equal((await api('sato',{action:'documentList'})).some(row=>row.id===privatePdf.id),false);
 assert.equal((await fetch(url+'?sourcePdf='+privatePdf.id+'&site=sakura',{headers:{Authorization:'Bearer sato'}})).status,404);
 assert.equal((await fetch(url+'?sourcePdf='+sourcePdf.id+'&site=outside',{headers:{Authorization:'Bearer sato'}})).status,404);
 const intakeAnswers=[];
 const intakeText='相談ラウンド確認：機器で困っています';
 for(const field of ['target','error','attempt']){
  const response=await api('linh',{action:'adaptiveSearch',text:intakeText,language:'ja',answers:intakeAnswers});
  assert.equal(response.adaptive.mode,'clarify');assert.equal(response.adaptive.question.field,field);
  intakeAnswers.push({field,prompt:response.adaptive.question.text,text:'分かる範囲で回答'});
 }
 const intakeHandoff=await api('linh',{action:'adaptiveSearch',text:intakeText,language:'ja',answers:intakeAnswers});
 assert.equal(intakeHandoff.adaptive.mode,'handoff');
 const asked=await api('linh',{action:'ask',id:randomUUID(),text:intakeText,language:'ja',intake:intakeAnswers});
 assert.equal(asked.consultation.primary,'troubleshooting');assert.deepEqual(asked.consultation.secondary,['work_instruction']);assert.deepEqual(asked.intakeAnswers,intakeAnswers);
 const attachment=await sharp({create:{width:20,height:20,channels:3,background:'#fff'}}).png().toBuffer();
 const photoResult=await api('linh',{action:'adaptiveSearch',text:'Tôi không thể quét mã vạch.',language:'vi',answers:[],photo:attachment.toString('base64')});
 assert.equal(photoResult.photoAnalyzed,true);
 const blocked=await api('linh',{action:'adaptiveSearch',text:'薬品がこぼれた',language:'ja',answers:[]});assert.equal(blocked.adaptive.mode,'safety');assert.deepEqual(blocked.matches,[]);
 const adaptive=await api('linh',{action:'adaptiveSearch',text:'Tôi không thể quét mã vạch.',language:'vi',answers:[]});assert.equal(adaptive.adaptive.analysis.primary,'troubleshooting');assert.ok(adaptive.matches.some(row=>row.id==='demo-interactive-manual'));assert.ok(!adaptive.matches.some(row=>row.id==='foreign-manual'));
 const assignedId=randomUUID();await api('linh',{action:'ask',id:assignedId,text:'担当者テスト',language:'ja'});
 const assign=actor=>fetch(url,{method:'POST',headers:{Authorization:'Bearer '+actor,'Content-Type':'application/json'},body:JSON.stringify({action:'assign',siteId:'sakura',id:assignedId})});
 const claims=await Promise.all([assign('sato'),assign('tanaka')]);assert.deepEqual(claims.map(row=>row.status).sort(),[200,409]);
 const winner=(await claims.find(row=>row.ok).json()).assigneeId,other=winner==='sato'?'tanaka':'sato';
 await api(other,{action:'reply',id:assignedId,messageId:randomUUID(),text:'担当者ではない'},409);
 const handoff=await api(winner,{action:'assign',id:assignedId,managerId:other});assert.equal(handoff.assigneeId,other);assert.equal(handoff.assignments.length,2);
 const source=await resolveQuestion('商品が読み取れません');let manual=await completed(source.manual.id);
 assert.equal(manual.generation.state,'ready',JSON.stringify(manual)+'\n'+log);assert.equal(manual.pipeline.promptVersion,'bridge-interactive-v1.0');assert.equal(manual.pipeline.verification,'passed');
 assert.deepEqual(manual.imageUrls,[]);assert.ok(manual.program.blocks.some(block=>block.type==='check'));assert.equal(manual.extraction.causeKnown,false);
 await api('sato',{action:'viewManual',id:manual.id,version:manual.updatedAt},403);
 await api('linh',{action:'saveProgram',id:manual.id,version:manual.updatedAt,program:manual.program,publish:true,confirmPermissions:true},403);
 await api('sato',{action:'sendManual',id:manual.id,version:manual.updatedAt,employeeIds:['alex']},400);
 assert.equal((await api('alex')).manuals.some(row=>row.id===manual.id),false);
 await api('sato',{action:'saveProgram',id:manual.id,version:manual.updatedAt,program:manual.program,publish:true,confirmPermissions:false},400);
 await api('sato',{action:'saveProgram',id:manual.id,version:manual.updatedAt,program:manual.program,publish:true,confirmPermissions:true});
 manual=(await api('sato')).manuals.find(row=>row.id===manual.id);assert.equal(manual.status,'published');assert.ok(manual.approvedAt);assert.ok(manual.audit.some(entry=>entry.action==='published'));assert.equal(manual.embedding?.model,'test-embedding');assert.equal(manual.embedding?.values.length,256);
 const result=await api('alex',{action:'viewManual',id:manual.id,version:manual.updatedAt});
 for(const field of ['evidence','pipeline','clarification','extraction','quality','audit','embedding','protectedSource'])assert.equal(result[field],undefined,field+' must stay private');
 const path=['inspect','wipe','check'],runId=randomUUID();const event=(event,path,run=runId)=>({action:'manualSession',id:manual.id,version:manual.updatedAt,event,runId:run,path,language:'ja'});
 await api('sato',event('start',[]),403);await api('alex',event('start',[]));
 await api('alex',event('resolved',['inspect','check']),400);await api('alex',event('resolved',path));await api('alex',event('resolved',path));
 let stats=(await api('sato')).manualStats[manual.id];assert.deepEqual(stats,{uses:1,resolved:1,unresolved:0});
 const failure=randomUUID();await api('alex',event('start',[],failure));
 const failed=await api('alex',{...event('unresolved',['inspect'],failure),text:'説明の方法でも解決しません。'});assert.ok(failed.question);assert.equal(failed.question.status,'new');
 const duplicate=await api('alex',event('unresolved',['inspect'],failure));assert.equal(duplicate.question.id,failed.question.id);
 stats=(await api('sato')).manualStats[manual.id];assert.deepEqual(stats,{uses:2,resolved:1,unresolved:1});
 const search=await api('alex',{action:'search',text:manual.content.title,language:'ja'});assert.ok(search.matches.some(match=>match.id===manual.id));
 assert.equal((await api('alex',{action:'search',text:'全く違う問題',language:'ja'})).matches.length,0);
 assert.equal((await api('alex',{action:'search',text:'低類似度の質問',language:'ja'})).matches.length,0);
 await api('alex',{action:'viewManual',id:'foreign-manual',version:seed.manuals.at(-1).updatedAt},404);assert.equal((await api('sato')).manuals.some(row=>row.id==='foreign-manual'),false);
 await api('alex',{action:'reportManual',id:manual.id,version:manual.updatedAt,reason:'outdated'});
 assert.equal((await api('sato')).manuals.find(row=>row.id===manual.id).feedback.length,1);
 assert.equal((await api('alex')).manuals.find(row=>row.id===manual.id).feedback,undefined);
 const archived=await api('sato',{action:'manualState',id:manual.id,version:manual.updatedAt,mode:'archive'});assert.equal(archived.reviewState,'archived');
 await api('alex',{action:'reportManual',id:manual.id,version:manual.updatedAt,reason:'outdated'},404);
 assert.equal((await api('alex')).manuals.some(row=>row.id===manual.id),false);await api('alex',event('start',[],randomUUID()),404);
 const gapSource=await resolveQuestion('追加確認の商品登録');let gap=await completed(gapSource.manual.id);assert.equal(gap.reviewState,'awaiting_answers');assert.equal(gap.clarification.round,1);
 const originalMessages=(await api('sato')).questions.find(row=>row.id===gapSource.id).messages;
 await api('linh',{action:'answerManual',id:gap.id,version:gap.updatedAt,answers:[{questionId:gap.clarification.questions[0].id,answer:'乾いた布で拭くと商品名が表示されました。'}]},403);
 await api('sato',{action:'answerManual',id:gap.id,version:gap.updatedAt,answers:[{questionId:'not-pending',answer:'回答'}]},400);
 await api('sato',{action:'answerManual',id:gap.id,version:gap.updatedAt,answers:[{questionId:gap.clarification.questions[0].id,answer:'乾いた布で拭くと商品名が表示されました。'}]});
 await approve(gap.id,1);gap=await completed(gap.id);assert.equal(gap.generation.state,'ready');assert.equal(gap.clarification.answers.length,1);
 assert.deepEqual((await api('sato')).questions.find(row=>row.id===gapSource.id).messages,originalMessages);
 const limitSource=await resolveQuestion('上限の追加確認');let limited=await completed(limitSource.manual.id);
 for(let round=1;round<=3;round++){assert.equal(limited.clarification.round,round);await api('sato',{action:'answerManual',id:limited.id,version:limited.updatedAt,answers:limited.clarification.questions.map(question=>({questionId:question.id,answer:'管理者の確認回答 '+round}))});await approve(limited.id,round);limited=await completed(limited.id);}
 assert.equal(limited.reviewState,'held');assert.ok(limited.quality.issues.some(issue=>issue.includes('上限')));
 for(const [title,state,error] of [['根拠失敗の相談','held'],['意味失敗の相談','held'],['構造失敗の相談','held'],['不正JSONの相談','failed','invalid-json'],['API障害の相談','failed','provider-error'],['利用枠エラーの相談','failed','quota'],['APIタイムアウトの相談','failed','generation-timeout']]){
  const broken=await completed((await resolveQuestion(title)).manual.id);assert.equal(broken.generation.state,state,JSON.stringify(broken)+'\n'+log);assert.equal(broken.status,'draft');if(error)assert.equal(broken.generation.error,error);
 }
 const branch=await completed((await resolveQuestion('分岐の商品登録')).manual.id);assert.ok(branch.program.blocks.some(block=>block.type==='branch'));assert.ok(branch.program.blocks.some(block=>block.type==='warning'));
 const data=JSON.parse(await readFile(join(folder,'data.json'),'utf8'));assert.equal(data.manualUses.filter(use=>use.manualId===manual.id).length,2);
});
