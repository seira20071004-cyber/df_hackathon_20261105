import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('only managers deliver published versions to valid staff, with private idempotent read receipts',{timeout:90000},async t=>{
  const root=fileURLToPath(new URL('../',import.meta.url));await mkdir(join(root,'.bridge-work'),{recursive:true});
  const folder=await mkdtemp(join(root,'.bridge-work','delivery-test-'));
  const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  const child=spawn(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(port)],
    {cwd:root,env:{...process.env,BRIDGE_DEMO:'true',BRIDGE_ALLOW_PUBLIC_DEMO:'true',BRIDGE_USER_REQUESTS_PER_MINUTE:'10000',BRIDGE_ORG_REQUESTS_PER_MINUTE:'20000',BRIDGE_AI_CALLS_PER_MINUTE:'10000',BRIDGE_DEMO_DATA_DIR:folder,GEMINI_API_KEY:'',GEMINI_PROVIDER:'developer'},stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',data=>log+=data);child.stderr.on('data',data=>log+=data);
  t.after(async()=>{if(child.exitCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;}await rm(folder,{recursive:true,force:true});});
  const url=`http://127.0.0.1:${port}/api/bridge`;
  let ready=false;for(let i=0;i<80;i++){ready=await fetch(url+'?config').then(response=>response.ok).catch(()=>false);if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready,log);
  async function api(actor,action,status=200){const response=await fetch(url,{method:action?'POST':'GET',headers:{Authorization:'Bearer '+actor,'Content-Type':'application/json'},body:action?JSON.stringify({siteId:'sakura',...action}):undefined});const result=await response.json();assert.equal(response.status,status,JSON.stringify(result)+'\n'+log);return result;}
  let manager=await api('sato');let manual=manager.manuals.find(row=>row.id==='sample-manual');
  assert.deepEqual(manager.staff.map(row=>row.id).sort(),['alex','linh']);assert.deepEqual((await api('alex')).staff,[]);
  const action=()=>({action:'sendManual',id:manual.id,version:manual.updatedAt,employeeIds:['alex']});
  await api('linh',action(),403);
  await api('sato',{...action(),employeeIds:[]},400);
  await api('sato',{...action(),employeeIds:['alex','sato']},400);
  await api('sato',{...action(),employeeIds:['alex','unknown']},400);
  assert.equal((await api('alex')).deliveries.length,0);
  await api('sato',{...action(),version:'old-version'},409);
  await api('sato',{...action(),siteId:'other-site'},403);
  assert.deepEqual(await api('sato',{...action(),employeeIds:['alex','alex']}),{sent:1});
  let alex=await api('alex');assert.equal(alex.deliveries.length,1);assert.equal(alex.deliveries[0].readAt,null);assert.equal(alex.manuals[0].id,manual.id);assert.equal(alex.manuals[0].pipeline,undefined);
  assert.equal((await api('linh')).deliveries.length,0);assert.equal((await api('linh')).manuals.length,0);
  await api('alex',{action:'viewManual',id:manual.id,version:manual.updatedAt});
  const readAt=(await api('alex')).deliveries[0].readAt;assert.ok(readAt);
  await api('sato',action());await api('alex',{action:'viewManual',id:manual.id,version:manual.updatedAt});
  alex=await api('alex');assert.equal(alex.deliveries.length,1);assert.equal(alex.deliveries[0].readAt,readAt);
  await api('sato',{...action(),employeeIds:['alex','linh']});
  assert.equal((await api('sato')).deliveries.length,2);assert.equal((await api('linh')).deliveries[0].readAt,null);
  await api('sato',{action:'saveManual',id:manual.id,version:manual.updatedAt,content:manual.content,publish:false});
  manual=(await api('sato')).manuals.find(row=>row.id===manual.id);
  await api('sato',action(),409);assert.equal((await api('alex')).deliveries.length,1);assert.equal((await api('alex')).manuals.length,1);assert.notEqual((await api('alex')).manuals[0].updatedAt,manual.updatedAt);
  await api('sato',{action:'saveManual',id:manual.id,version:manual.updatedAt,content:manual.content,publish:true});
  manual=(await api('sato')).manuals.find(row=>row.id===manual.id);
  assert.equal((await api('alex')).deliveries.length,0);
  await api('sato',action());alex=await api('alex');assert.equal(alex.deliveries.length,1);assert.equal(alex.deliveries[0].version,manual.updatedAt);assert.equal(alex.deliveries[0].readAt,null);
  assert.equal((await api('linh')).deliveries.length,0);
});
