import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir,mkdtemp,rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('illustrated manuals preserve evidence, approval and regeneration boundaries',{timeout:90000},async t=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const folder=join(root,'.bridge-work');
  await mkdir(folder,{recursive:true});
  const testFolder=await mkdtemp(join(folder,'manual-test-'));
  const socket=createServer();
  await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const port=socket.address().port;
  await new Promise(resolve=>socket.close(resolve));
  const child=spawn(process.execPath,['--import',new URL('./provider-mock.mjs',import.meta.url).href,join(root,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(port)],
    {cwd:root,env:{...process.env,BRIDGE_DEMO:'true',BRIDGE_DEMO_DATA_DIR:testFolder,GEMINI_API_KEY:'test-fixture',GEMINI_PROVIDER:'developer'},stdio:['ignore','pipe','pipe']});
  let log='';
  child.stdout.on('data',buffer=>log+=buffer);
  child.stderr.on('data',buffer=>log+=buffer);
  t.after(async()=>{
    if(child.exitCode===null) {
      const exit=new Promise(resolve=>child.once('exit',resolve));
      child.kill();await exit;
    }
    await rm(testFolder,{recursive:true,force:true});
  });
  const url='http://127.0.0.1:'+port+'/api/bridge';
  let ready=false;
  for(let i=0;i<80;i++){
    ready=await fetch(url+'?config').then(response=>response.ok).catch(()=>false);
    if(ready)break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,log);
  async function api(actor,payload,status=200){
    const response=await fetch(url,{method:payload?'POST':'GET',headers:{Authorization:'Bearer '+actor,'Content-Type':'application/json'},body:payload?JSON.stringify({siteId:'sakura',...payload}):undefined});
    const body=await response.json();
    assert.equal(response.status,status,JSON.stringify(body)+'\n'+log);
    return body;
  }
  async function resolveQuestion(title){
    const id=randomUUID();
    await api('linh',{action:'ask',id,text:title,language:'ja'});
    await api('sato',{action:'reply',id,messageId:randomUUID(),text:'1階の清掃用具室に行き、指定の棚を確認してください。'});
    const started=Date.now();
    await api('linh',{action:'resolve',id});
    assert.ok(Date.now()-started<2000,'Resolution should not wait for generation');
    const draft=(await api('sato')).manuals.find(manual=>manual.sourceQuestionIds.includes(id));
    return draft;
  }
  async function completed(id){
    let manual;
    for(let i=0;i<60;i++){
      manual=(await api('sato')).manuals.find(row=>row.id===id);
      if(['ready','failed'].includes(manual.generation?.state))return manual;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.fail('Generation did not complete: '+JSON.stringify(manual?.generation)+'\n'+log);
  }
  const draft=await resolveQuestion('洗剤はどこに保管されていますか？');
  let manual=await completed(draft.id);
  assert.equal(manual.generation.state,'ready');
  assert.equal(manual.imageLayout,'steps');
  assert.equal(manual.imageUrls.length,2);
  assert.ok(manual.imageUrls.every(url=>url.startsWith('data:image/webp;base64,')));
  assert.equal(manual.evidence.steps.length,2);
  assert.deepEqual(manual.content.cautions,[]);
  assert.equal((await api('alex')).manuals.length,0);
  await api('linh',{action:'regenerateManual',id:manual.id,version:manual.updatedAt,imagesOnly:true},403);
  await api('sato',{action:'saveManual',id:manual.id,version:manual.updatedAt,content:manual.content,publish:true});
  manual=(await api('sato')).manuals.find(row=>row.id===manual.id);
  const result=await api('alex',{action:'viewManual',id:manual.id,version:manual.updatedAt});
  assert.equal(result.evidence,undefined);
  assert.equal((await api('alex')).manuals[0].evidence,undefined);
  const edited={...manual.content,steps:['編集した対処法']};
  await api('sato',{action:'saveManual',id:manual.id,version:manual.updatedAt,content:edited,publish:true},400);
  await api('sato',{action:'saveManual',id:manual.id,version:manual.updatedAt,content:edited,publish:false});
  manual=(await api('sato')).manuals.find(row=>row.id===manual.id);
  assert.equal(manual.imageUrls.length,0);
  assert.equal(manual.generation.error,'content-changed');
  assert.equal((await api('alex')).manuals.some(row=>row.id===manual.id),false);
  await api('sato',{action:'regenerateManual',id:manual.id,version:manual.updatedAt,imagesOnly:true});
  manual=await completed(manual.id);
  assert.equal(manual.generation.state,'ready');
  assert.equal(manual.imageUrls.length,1);
  assert.deepEqual(manual.content.steps,['編集した対処法']);
  const invalid=await completed((await resolveQuestion('根拠失敗の質問')).id);
  assert.equal(invalid.generation.error,'unverified-source');
  assert.equal(invalid.imageUrls.length,0);
  const imageFailure=await completed((await resolveQuestion('画像失敗の質問')).id);
  assert.equal(imageFailure.generation.error,'quota');
  assert.equal(imageFailure.status,'draft');
  assert.ok(imageFailure.content.steps.length);
});

