import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {seedDemo} from '../lib/demo.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
async function server(t,overrides={}){
 await mkdir(join(root,'.bridge-work'),{recursive:true});const folder=await mkdtemp(join(root,'.bridge-work','security-'));
 const seed={...seedDemo(),manualViews:[],manualDeliveries:[],manualUses:[]};const draft=structuredClone(seed.manuals[0]);seed.manuals.push({...draft,id:'unapproved',status:'draft',approvedBy:null},{...draft,id:'foreign-private',organizationId:'foreign',content:{...draft.content,title:'他組織だけの秘密マニュアル'}});seed.questions.push({...structuredClone(seed.questions[0]),id:'foreign-chat',organizationId:'foreign',employeeId:'alex'});await writeFile(join(folder,'data.json'),JSON.stringify(seed));
 const sock=createServer();await new Promise(r=>sock.listen(0,'127.0.0.1',r));const port=sock.address().port;await new Promise(r=>sock.close(r));
 const child=spawn(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(port)],{cwd:root,env:{...process.env,BRIDGE_DEMO:'true',BRIDGE_ALLOW_PUBLIC_DEMO:'true',BRIDGE_DEMO_DATA_DIR:folder,BRIDGE_USER_REQUESTS_PER_MINUTE:'10000',BRIDGE_ORG_REQUESTS_PER_MINUTE:'20000',BRIDGE_PRIVACY_STRICT:'false',BRIDGE_SENSITIVE_PROVIDER:'local',GEMINI_API_KEY:'',GEMINI_PROVIDER:'developer',GEMINI_VERTEX_AUTH:'',...overrides},stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',v=>log+=v);child.stderr.on('data',v=>log+=v);
 t.after(async()=>{if(child.exitCode===null){const exit=new Promise(r=>child.once('exit',r));child.kill();await exit;}await rm(folder,{recursive:true,force:true});});
 const url='http://127.0.0.1:'+port+'/api/bridge';let ready=false;for(let i=0;i<100;i++){ready=await fetch(url+'?config').then(r=>r.status!==404).catch(()=>false);if(ready)break;await new Promise(r=>setTimeout(r,100));}assert.ok(ready,log);
 async function api(actor,body,status=200,headers={}){const response=await fetch(url,{method:body?'POST':'GET',headers:{...(actor?{Authorization:'Bearer '+actor}:{}),'Content-Type':'application/json',...headers},body:body?JSON.stringify({siteId:'sakura',...body}):undefined});const value=await response.json();assert.equal(response.status,status,JSON.stringify(value)+'\n'+log);return {value,response};}
 return {api,url,folder,logs:()=>log};
}
test('API security: auth, tenant isolation, privilege changes, unpublished drafts and fixed approvals',{timeout:90000},async t=>{
 const {api,url,folder,logs}=await server(t);
 await api('',undefined,401);await api('invalid',undefined,401);await api('alex',undefined,401,{'X-Bridge-Organization':'foreign'});
 const manager=(await api('sato')).value,manual=manager.manuals.find(m=>m.id==='demo-interactive-manual');
 assert.ok(!manager.manuals.some(m=>m.id==='foreign-private'));assert.ok(!manager.questions.some(q=>q.id==='foreign-chat'));
 for(const action of [
  {action:'saveProgram',id:manual.id,version:manual.updatedAt,program:manual.program,publish:true,confirmPermissions:true},
  {action:'manualState',id:manual.id,version:manual.updatedAt,mode:'unpublish'},
  {action:'answerManual',id:manual.id,version:manual.updatedAt,answers:[{questionId:'q',answer:'x'}]},
  {action:'sendManual',id:manual.id,version:manual.updatedAt,employeeIds:['linh']}
 ])await api('alex',action,403);
 await api('alex',{action:'ask',id:randomUUID(),text:'question',language:'ja',role:'manager',organizationId:'foreign'},400);
 await api('alex',{action:'reply',id:'foreign-chat',messageId:randomUUID(),text:'attack'},404);
 for(const id of ['foreign-private','unapproved'])await api('alex',{action:'viewManual',id,version:manual.updatedAt},404);
 assert.equal((await api('alex',{action:'search',text:'他組織だけの秘密マニュアル',language:'ja'})).value.matches.length,0);
 await api('alex',{action:'search',siteId:'another-site',text:'help',language:'ja'},403);
 const old=structuredClone(manual.program);await api('alex',{action:'viewManual',id:manual.id,version:manual.updatedAt});
 const edited=structuredClone(old);edited.title='編集した未承認のタイトル';
 await api('sato',{action:'saveProgram',id:manual.id,version:manual.updatedAt,program:edited,publish:true,confirmPermissions:true},400);
 let draft=(await api('sato',{action:'saveProgram',id:manual.id,version:manual.updatedAt,program:edited,publish:false,confirmPermissions:false})).value;
 let staff=(await api('alex',{action:'viewManual',id:manual.id,version:manual.updatedAt})).value;assert.equal(staff.content.title,old.title);assert.equal(staff.publishedSnapshot,undefined);assert.equal(staff.security,undefined);
 await api('alex',{action:'viewManual',id:manual.id,version:draft.updatedAt},404);
 const credential='AIza'+'X'.repeat(35),sensitive=structuredClone(draft.program);sensitive.title='連絡先 test-person@example.com '+credential;
 draft=(await api('sato',{action:'saveProgram',id:manual.id,version:draft.updatedAt,program:sensitive,publish:false,confirmPermissions:false})).value;
 assert.equal(draft.reviewState,'held');assert.ok(draft.security.inspection.findings.length);
 await api('sato',{action:'saveProgram',id:manual.id,version:draft.updatedAt,program:draft.program,publish:true,confirmPermissions:true},400);
 assert.ok(!logs().includes(credential));assert.ok(!logs().includes('test-person@example.com'));
 const cleaned=structuredClone(draft.program);cleaned.title='確認後のタイトル';draft=(await api('sato',{action:'saveProgram',id:manual.id,version:draft.updatedAt,program:cleaned,publish:false,confirmPermissions:false})).value;
 const approved=(await api('sato',{action:'saveProgram',id:manual.id,version:draft.updatedAt,program:draft.program,publish:true,confirmPermissions:true})).value;assert.equal(approved.status,'published');
 await api('sato',{action:'saveProgram',id:manual.id,version:draft.updatedAt,program:draft.program,publish:true,confirmPermissions:true},409);
 await api('alex',{action:'viewManual',id:manual.id,version:manual.updatedAt},404);
 const rejected=(await api('sato',{action:'manualState',id:'unapproved',version:manager.manuals.find(m=>m.id==='unapproved').updatedAt,mode:'reject'})).value;assert.equal(rejected.reviewState,'rejected');
 const badUrl=await fetch(url,{method:'POST',headers:{Authorization:'Bearer sato','Content-Type':'application/json'},body:JSON.stringify({action:'saveManual',siteId:'sakura',id:'sample-manual',version:manager.manuals.find(m=>m.id==='sample-manual').updatedAt,content:manager.manuals.find(m=>m.id==='sample-manual').content,publish:false,figures:[{id:randomUUID(),afterStep:0,url:'http://169.254.169.254/computeMetadata/v1/',caption:''}]})});assert.equal(badUrl.status,400);
 const crossOrigin=await fetch(url,{method:'POST',headers:{Authorization:'Bearer alex',Origin:'https://evil.invalid','Content-Type':'application/json'},body:'{}'});assert.equal(crossOrigin.status,403);
 const huge=await fetch(url,{method:'POST',headers:{Authorization:'Bearer alex','Content-Type':'application/json'},body:'x'.repeat(2_400_001)});assert.equal(huge.status,413);
 const invalid=await fetch(url,{method:'POST',headers:{Authorization:'Bearer alex','Content-Type':'application/json'},body:'{broken'});assert.equal(invalid.status,400);
 const data=JSON.parse(await readFile(join(folder,'data.json'),'utf8'));assert.ok(!data.questions.some(q=>q.originalText==='question'));assert.ok(data.manuals.some(m=>m.organizationId==='foreign'));
});
test('request abuse is denied with retry hints and explicit demo/App Check gates',{timeout:90000},async t=>{
 const limited=await server(t,{BRIDGE_USER_REQUESTS_PER_MINUTE:'2'});await limited.api('alex');await limited.api('alex');const denied=await limited.api('alex',undefined,429);assert.equal(denied.response.headers.get('retry-after'),'60');assert.ok(limited.logs().includes('rate-limited'));
 const gated=await server(t,{BRIDGE_APP_CHECK_ENFORCE:'true'});await gated.api('alex',undefined,403);
 const production=await server(t,{BRIDGE_ALLOW_PUBLIC_DEMO:'false'});await production.api('alex',undefined,503);
});
