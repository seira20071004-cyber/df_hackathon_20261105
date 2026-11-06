import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {seedDemo} from '../lib/demo.ts';

test('SDK pipeline, supplements, approval, sessions and escalation remain scoped and durable',{timeout:120000},async t=>{
 const root=fileURLToPath(new URL('../',import.meta.url));await mkdir(join(root,'.bridge-work'),{recursive:true});
 const folder=await mkdtemp(join(root,'.bridge-work','manual-test-'));const seed={...seedDemo(),manualViews:[],manualDeliveries:[],manualUses:[]};
 seed.manuals.push({...structuredClone(seed.manuals[0]),id:'foreign-manual',organizationId:'other-company',content:{...seed.manuals[0].content,title:'他組織だけの秘密情報'}});
 await writeFile(join(folder,'data.json'),JSON.stringify(seed));
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,['--import',new URL('./provider-mock.mjs',import.meta.url).href,join(root,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(port)],{cwd:root,env:{...process.env,BRIDGE_DEMO:'true',BRIDGE_ALLOW_PUBLIC_DEMO:'true',BRIDGE_USER_REQUESTS_PER_MINUTE:'10000',BRIDGE_ORG_REQUESTS_PER_MINUTE:'20000',BRIDGE_AI_CALLS_PER_MINUTE:'10000',BRIDGE_DEMO_DATA_DIR:folder,GEMINI_API_KEY:'test-fixture',GEMINI_PROVIDER:'developer',GOOGLE_GENAI_USE_VERTEXAI:'false',GEMINI_GENERATE_IMAGES:'false',GEMINI_EMBEDDING_MODEL:'test-embedding'},stdio:['ignore','pipe','pipe']});
 let log='';child.stdout.on('data',data=>log+=data);child.stderr.on('data',data=>log+=data);
 t.after(async()=>{if(child.exitCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;}await rm(folder,{recursive:true,force:true});});
 const url='http://127.0.0.1:'+port+'/api/bridge';let ready=false;
 for(let i=0;i<80;i++){ready=await fetch(url+'?config').then(response=>response.ok).catch(()=>false);if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready,log);
 async function api(actor,input,status=200){const response=await fetch(url,{method:input?'POST':'GET',headers:{Authorization:'Bearer '+actor,'Content-Type':'application/json'},body:input?JSON.stringify({siteId:'sakura',...input}):undefined});const result=await response.json();assert.equal(response.status,status,JSON.stringify(result)+'\n'+log);return result;}
 async function resolveQuestion(title){const id=randomUUID();await api('linh',{action:'ask',id,text:title,language:'ja'});await api('sato',{action:'reply',id,messageId:randomUUID(),text:'汚れを目で確認し、乾いた布で拭いてください。商品名が表示されたら解決です。'});
  const before=Date.now();await api('linh',{action:'resolve',id});assert.ok(Date.now()-before<2000,'Resolution must not wait for Gemini');await api('linh',{action:'resolve',id});
  const matches=(await api('sato')).manuals.filter(manual=>manual.sourceQuestionIds.includes(id));assert.equal(matches.length,1);return {id,manual:matches[0]};}
 async function completed(id){let manual;for(let i=0;i<150;i++){manual=(await api('sato')).manuals.find(row=>row.id===id);if(['ready','failed','held','awaiting_answers'].includes(manual.generation?.state))return manual;await new Promise(resolve=>setTimeout(resolve,100));}assert.fail(JSON.stringify(manual)+'\n'+log);}
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
 for(const field of ['evidence','pipeline','clarification','extraction','quality','audit','embedding'])assert.equal(result[field],undefined,field+' must stay private');
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
 await api('sato',{action:'manualState',id:manual.id,version:manual.updatedAt,mode:'unpublish'});
 assert.equal((await api('alex')).manuals.some(row=>row.id===manual.id),false);await api('alex',event('start',[],randomUUID()),404);
 const gapSource=await resolveQuestion('追加確認の商品登録');let gap=await completed(gapSource.manual.id);assert.equal(gap.reviewState,'awaiting_answers');assert.equal(gap.clarification.round,1);
 const originalMessages=(await api('sato')).questions.find(row=>row.id===gapSource.id).messages;
 await api('linh',{action:'answerManual',id:gap.id,version:gap.updatedAt,answers:[{questionId:gap.clarification.questions[0].id,answer:'乾いた布で拭くと商品名が表示されました。'}]},403);
 await api('sato',{action:'answerManual',id:gap.id,version:gap.updatedAt,answers:[{questionId:'not-pending',answer:'回答'}]},400);
 await api('sato',{action:'answerManual',id:gap.id,version:gap.updatedAt,answers:[{questionId:gap.clarification.questions[0].id,answer:'乾いた布で拭くと商品名が表示されました。'}]});
 gap=await completed(gap.id);assert.equal(gap.generation.state,'ready');assert.equal(gap.clarification.answers.length,1);
 assert.deepEqual((await api('sato')).questions.find(row=>row.id===gapSource.id).messages,originalMessages);
 const limitSource=await resolveQuestion('上限の追加確認');let limited=await completed(limitSource.manual.id);
 for(let round=1;round<=3;round++){assert.equal(limited.clarification.round,round);await api('sato',{action:'answerManual',id:limited.id,version:limited.updatedAt,answers:limited.clarification.questions.map(question=>({questionId:question.id,answer:'管理者の確認回答 '+round}))});limited=await completed(limited.id);}
 assert.equal(limited.reviewState,'held');assert.ok(limited.quality.issues.some(issue=>issue.includes('上限')));
 for(const [title,state,error] of [['根拠失敗の相談','held'],['意味失敗の相談','held'],['構造失敗の相談','held'],['不正JSONの相談','failed','invalid-json'],['API障害の相談','failed','provider-error'],['利用枠エラーの相談','failed','quota'],['APIタイムアウトの相談','failed','generation-timeout']]){
  const broken=await completed((await resolveQuestion(title)).manual.id);assert.equal(broken.generation.state,state,JSON.stringify(broken)+'\n'+log);assert.equal(broken.status,'draft');if(error)assert.equal(broken.generation.error,error);
 }
 const branch=await completed((await resolveQuestion('分岐の商品登録')).manual.id);assert.ok(branch.program.blocks.some(block=>block.type==='branch'));assert.ok(branch.program.blocks.some(block=>block.type==='warning'));
 const data=JSON.parse(await readFile(join(folder,'data.json'),'utf8'));assert.equal(data.manualUses.filter(use=>use.manualId===manual.id).length,2);
});
