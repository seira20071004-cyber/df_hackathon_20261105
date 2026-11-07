// Optional non-mutating smoke checks against a running loopback demo only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createBridgeTransport} from '../lib/bridge-transport.ts';
const origin=new URL(process.env.BRIDGE_SMOKE_URL||'http://127.0.0.1:3003');
if(!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))throw Error('Smoke checks require a loopback demo');
const endpoint=new URL('/api/bridge',origin);
const call=(actor,input,extra={})=>fetch(endpoint,{method:input?'POST':'GET',headers:{...(actor?{Authorization:'Bearer '+actor}:{}),'Content-Type':'application/json',...extra},body:input?JSON.stringify({siteId:'sakura',...input}):undefined});
const config=await fetch(endpoint+'?config').then(r=>r.json());assert.equal(config.demo,true,'Never run demo checks against real authentication');

test('live demo configuration and common browser transport work without loading App Check',async()=>{
 assert.equal(config.appCheck.enabled,false);const browser=createBridgeTransport({fetcher:(path,init)=>fetch(new URL(path,origin),init),loadTokenSource:async()=>{throw Error('Unexpected attestation');}});
 const response=await browser('',{headers:{Authorization:'Bearer sato'}});assert.equal(response.status,200);assert.equal((await response.json()).profile.role,'manager');
});
test('live API rejects anonymous, forged-organisation and privilege-change requests',async()=>{
 assert.equal((await call('')).status,401);assert.equal((await call('alex',undefined,{'X-Bridge-Organization':'foreign'})).status,401);
 assert.equal((await call('alex',{action:'language',language:'ja',role:'manager'})).status,400);
});
test('live employee cannot manage manuals, read drafts or cross the site boundary',async()=>{
 const manager=await (await call('sato')).json();const published=manager.manuals.find(m=>m.status==='published');assert.ok(published);
 assert.equal((await call('alex',{action:'manualState',id:published.id,version:published.updatedAt,mode:'unpublish'})).status,403);
 const draft=manager.manuals.find(m=>m.status==='draft');if(draft)assert.equal((await call('alex',{action:'viewManual',id:draft.id,version:draft.updatedAt})).status,404);
 assert.equal((await call('alex',{action:'viewManual',id:published.id,version:published.updatedAt,siteId:'foreign'})).status,403);
});
test('live API rejects malformed, oversized and cross-origin bodies before applying changes',async()=>{
 for(const [body,headers,status] of [['{broken',{},400],['x'.repeat(2_400_001),{},413],['{}',{Origin:'https://evil.invalid'},403]]){
  const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer alex','Content-Type':'application/json',...headers},body});assert.equal(response.status,status);
 }
});
test('live development responses keep framing and external resource restrictions',async()=>{
 const response=await fetch(origin);assert.equal(response.status,200);assert.equal(response.headers.get('x-frame-options'),'DENY');const policy=response.headers.get('content-security-policy');assert.ok(policy.includes("frame-ancestors 'none'"));assert.ok(policy.includes("object-src 'none'"));assert.ok(!policy.includes('google.com'));
});
