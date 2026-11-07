// Isolated loopback development integration. Stop other next dev instances first.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,mkdir,rm,readFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {seedDemo} from '../lib/demo.ts';
test('live ACL change revokes old releases; assignments protect search, delivery, opening and sessions',{timeout:120000},async t=>{
 const root=fileURLToPath(new URL('../',import.meta.url));await mkdir(join(root,'.bridge-work'),{recursive:true});const folder=await mkdtemp(join(root,'.bridge-work','acl-test-'));
 const seed={...seedDemo(),manualViews:[],manualDeliveries:[],manualUses:[]};const manual=seed.manuals.find(row=>row.program);assert.ok(manual);await writeFile(join(folder,'data.json'),JSON.stringify(seed));
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'dev','--webpack','-H','127.0.0.1','-p',String(port)],{cwd:root,env:{...process.env,BRIDGE_DEMO:'true',BRIDGE_DEMO_DATA_DIR:folder,BRIDGE_SENSITIVE_PROVIDER:'local',BRIDGE_PRIVACY_STRICT:'false',BRIDGE_APP_CHECK_ENFORCE:'false',BRIDGE_APP_CHECK_CLIENT_ENABLED:'false',GEMINI_API_KEY:'',GEMINI_API_KEY_FILE:'',GEMINI_API_KEY_SECRET:'',GEMINI_PROVIDER:'developer',GEMINI_VERTEX_AUTH:''},stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',v=>logs+=v);child.stderr.on('data',v=>logs+=v);
 t.after(async()=>{if(child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;}await rm(folder,{recursive:true,force:true});});
 const url='http://127.0.0.1:'+port+'/api/bridge';let ready=false;for(let i=0;i<120;i++){if(child.exitCode!==null)break;ready=await fetch(url+'?config').then(r=>r.ok).catch(()=>false);if(ready)break;await new Promise(r=>setTimeout(r,250));}assert.ok(ready,'isolated dev server failed to start');
 async function api(actor,body,status=200){const response=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+actor,'Content-Type':'application/json'},body:body?JSON.stringify({siteId:'sakura',...body}):undefined});const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;}
 await api('alex',{action:'manualAccess',id:manual.id,version:manual.updatedAt,access:{level:'PUBLIC',allowedRoles:['employee'],allowedUserIds:[]}},403);
 await api('alex',{action:'viewManual',id:manual.id,version:manual.updatedAt});
 let draft=await api('sato',{action:'manualAccess',id:manual.id,version:manual.updatedAt,access:{level:'CONFIDENTIAL',allowedRoles:['employee','manager'],allowedUserIds:['alex']}});
 assert.equal(draft.status,'draft');assert.equal(draft.publishedSnapshot,undefined);await api('alex',{action:'viewManual',id:manual.id,version:manual.updatedAt},404);
 let published=await api('sato',{action:'saveProgram',id:draft.id,version:draft.updatedAt,program:draft.program,publish:true,confirmPermissions:true});
 assert.equal(published.status,'published');const view=await api('alex',{action:'viewManual',id:published.id,version:published.updatedAt});assert.equal(view.access,undefined);assert.equal(view.confidentiality,'CONFIDENTIAL');
 await api('linh',{action:'viewManual',id:published.id,version:published.updatedAt},404);
 const search=await api('linh',{action:'search',text:published.content.title,language:'ja'});assert.ok(!search.matches.some(row=>row.id===published.id));
 await api('sato',{action:'sendManual',id:published.id,version:published.updatedAt,employeeIds:['linh']},400);
 await api('sato',{action:'sendManual',id:published.id,version:published.updatedAt,employeeIds:['alex']});
 const started=await api('alex',{action:'manualSession',id:published.id,version:published.updatedAt,runId:'192ce9e1-cfc1-46f5-b181-897236447aa2',event:'start',path:[],language:'ja'});assert.ok(started);
 draft=await api('sato',{action:'manualAccess',id:published.id,version:published.updatedAt,access:{level:'RESTRICTED',allowedRoles:['manager'],allowedUserIds:[]}});
 assert.equal(draft.reviewState,'held');await api('alex',{action:'viewManual',id:published.id,version:published.updatedAt},404);
 await api('sato',{action:'saveProgram',id:draft.id,version:draft.updatedAt,program:draft.program,publish:true,confirmPermissions:true},400);
 await api('sato',{action:'regenerateManual',id:draft.id,version:draft.updatedAt,imagesOnly:false},400);
 const staff=await api('alex');assert.ok(!staff.manuals.some(row=>row.id===draft.id));assert.ok(!staff.deliveries.some(row=>row.manualId===draft.id));
 const stored=JSON.parse(await readFile(join(folder,'data.json'),'utf8')).manuals.find(row=>row.id===draft.id);assert.ok(stored.audit.some(row=>row.action==='access_changed'));
 assert.ok(!logs.includes('GEMINI_API_KEY='));
});
