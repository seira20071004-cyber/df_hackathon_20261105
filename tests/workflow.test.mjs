import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const vi = 'Tôi cần dọn cầu thang từ tầng nào đến tầng nào?';
const answer = 'このデモ現場では、1階から3階までの階段と踊り場が対象です。';

async function availablePort() {
  const server = createServer();
  await new Promise((resolve,reject) => server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const {port} = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('Vietnamese consultation, safe reuse, and publication survive reload', {timeout: 90_000}, async t => {
  const root = fileURLToPath(new URL('../',import.meta.url));
  const demoFolder = join(root,'.bridge-work');
  await mkdir(demoFolder,{recursive:true});
  const testFolder = await mkdtemp(join(demoFolder,'test-'));
  const port = await availablePort();
  const child = spawn(process.execPath,[join(root,'node_modules','next','dist','bin','next'),'start','-H','127.0.0.1','-p',String(port)],{
    cwd:root, env:{...process.env, BRIDGE_DEMO:'true',BRIDGE_ALLOW_PUBLIC_DEMO:'true',BRIDGE_USER_REQUESTS_PER_MINUTE:'10000',BRIDGE_ORG_REQUESTS_PER_MINUTE:'20000',BRIDGE_AI_CALLS_PER_MINUTE:'10000', BRIDGE_DEMO_DATA_DIR:testFolder, GEMINI_API_KEY:''}, stdio:['ignore','pipe','pipe']
  });
  let log = '';
  child.stdout.on('data', buffer => log += buffer);
  child.stderr.on('data', buffer => log += buffer);
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit',resolve));
      child.kill();
      await exited;
    }
    await rm(testFolder,{recursive:true,force:true});
  });

  const url = 'http://127.0.0.1:' + port + '/api/bridge';
  let ready = false;
  for (let attempt = 0; attempt < 80 && child.exitCode === null; attempt++) {
    ready = await fetch(url+'?config').then(response => response.ok).catch(() => false);
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve,250));
  }
  assert.ok(ready, log);
  const page = await fetch('http://127.0.0.1:' + port);
  assert.equal(page.status,200);
  assert.match(await page.text(),/Bridge Work/);
  async function api(actor, action, expected = 200) {
    const response = await fetch(url, {method:action ? 'POST' : 'GET', headers:{Authorization:'Bearer ' + actor, 'Content-Type':'application/json'},
      body:action ? JSON.stringify({siteId:'sakura',...action}) : undefined});
    const body = await response.json();
    assert.equal(response.status,expected,JSON.stringify(body) + '\n' + log);
    return body;
  }
  const search = (actor = 'linh') => api(actor,{action:'search',text:vi,language:'vi'});
  const sample = (await search()).matches.find(match => match.id === 'sample-manual');
  assert.ok(sample);
  assert.equal((await api('sato')).profile.companyName,'Bridge Work デモ株式会社');
  assert.equal(sample.answer,'');
  for (const [text,language] of [['階段で滑ってけがをしたらどうすればいい？','ja'], ['How often do I clean the stairs?','en']]) {
    const unrelated = await api('linh',{action:'search',text,language});
    assert.equal(unrelated.matches.length,0);
  }
  assert.equal((await api('linh')).manuals.length,0);
  await api('linh',{action:'viewManual',id:sample.id,version:sample.version});
  assert.equal((await api('linh')).manuals[0].id,sample.id);
  assert.equal((await api('alex')).manuals.length,0);
  await api('stranger',undefined,401);
  await api('linh',{action:'search',siteId:'other',text:vi,language:'vi'},403);
  const id = randomUUID();
  const input = {action:'ask',id,text:vi,language:'vi'};
  await api('linh',input);
  await api('linh',input);
  const manager = await api('sato');
  assert.equal(manager.questions[0].id,id);
  assert.equal(manager.questions.filter(row => row.id === id).length,1);
  assert.match(manager.questions.find(row => row.id === id).japaneseText,/階段/);
  assert.equal((await api('alex')).questions.some(row => row.id === id),false);
  await api('alex',{action:'reply',id,text:'unauthorized',messageId:randomUUID()},404);
  const reply = {action:'reply',id,text:answer,messageId:randomUUID()};
  await api('sato',reply);
  await api('sato',reply);
  let row = (await api('linh')).questions.find(row => row.id === id);
  assert.equal(row.messages.length,1);
  assert.match(row.messages[0].translatedText,/cầu thang/);
  assert.equal(row.status,'active');
  await api('linh',{action:'reply',id,text:vi,messageId:randomUUID()});
  await api('linh',{action:'resolve',id});
  await api('linh',{action:'resolve',id});
  await api('linh',{action:'reuse',id,approved:true},403);
  await api('linh',{action:'reply',id,text:vi,messageId:randomUUID()},409);
  row = (await api('sato')).questions.find(row => row.id === id);
  assert.equal(row.status,'resolved');
  assert.ok(row.resolvedAt);
  assert.equal(row.approvedForReuse,false);
  assert.equal((await search('alex')).matches.some(match => match.id === id),false);
  await api('alex',{action:'selfResolve',id:randomUUID(),kind:'question',matchId:id,text:vi,language:'vi'},404);
  await api('sato',{action:'reuse',id,approved:true});
  assert.equal((await api('sato')).questions.find(row => row.id === id).approvedForReuse,true);
  const created = (await api('sato')).manuals.filter(manual => manual.sourceQuestionIds.includes(id));
  assert.equal(created.length,1);
  let [draft] = created;
  assert.equal(draft.status,'draft');
  assert.ok(draft.content.steps.includes(answer));
  assert.deepEqual(draft.content.cautions,[]);
  assert.equal((await api('alex')).manuals.some(row => row.id === draft.id),false);
  assert.equal((await search('alex')).matches.some(match => match.id === draft.id),false);
  await api('alex',{action:'viewManual',id:draft.id,version:draft.updatedAt},404);
  const content = {...draft.content,purpose:'清掃の担当範囲を確認する',steps:[answer]};
  const save = {action:'saveManual',id:draft.id,version:draft.updatedAt,content,publish:true};
  await api('linh',save,403);
  await api('sato',save,400);
  draft=await api('sato',{...save,publish:false});save.version=draft.updatedAt;
  await api('sato',save);
  await api('sato',save,409);
  const published = (await api('sato')).manuals.find(row => row.id === draft.id);
  assert.equal(published.status,'published');
  assert.equal(published.approvedBy,'sato');
  const candidates = await search('alex');
  const suggested = candidates.matches.find(match => match.id === draft.id);
  assert.ok(suggested);
  assert.equal((await api('alex')).manuals.length,0);
  await api('alex',{action:'selfResolve',id:randomUUID(),kind:'manual',matchId:draft.id,text:vi,language:'vi'},404);
  await api('alex',{action:'viewManual',id:draft.id,version:draft.updatedAt},404);
  await api('alex',{action:'viewManual',id:draft.id,version:suggested.version});
  assert.equal((await api('alex')).manuals[0].id,draft.id);
  assert.equal((await api('linh')).manuals.some(row => row.id === draft.id),false);
  const self = await api('alex',{action:'selfResolve',id:randomUUID(),kind:'manual',matchId:draft.id,text:vi,language:'vi'});
  assert.equal(self.status,'resolved');
  assert.equal(self.references[0].id,draft.id);
  assert.equal((await api('sato')).questions.find(row => row.id === self.id).approvedForReuse,false);
  const persisted = JSON.parse(await readFile(join(testFolder,'data.json'),'utf8'));
  assert.equal(persisted.questions.find(row => row.id === id).status,'resolved');
  assert.equal(persisted.manuals.find(row => row.id === draft.id).status,'published');
});
