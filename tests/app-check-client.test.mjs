import assert from 'node:assert/strict';
import test from 'node:test';
import {publicAppCheckConfig,appCheckCsp,appSecurityPolicy} from '../lib/app-check-config.ts';
import {createBridgeTransport} from '../lib/bridge-transport.ts';
const environment={BRIDGE_APP_CHECK_ENFORCE:'true',BRIDGE_APP_CHECK_SITE_KEY:'public-site-key',FIREBASE_WEB_API_KEY:'public-firebase-key',FIREBASE_WEB_APP_ID:'1:123:web:app',FIREBASE_PROJECT_ID:'test-project',BRIDGE_APP_CHECK_APP_IDS:' 1:123:web:app , other-app',GEMINI_API_KEY:'server-only-secret'};
const config=()=>({demo:false,appCheck:publicAppCheckConfig(environment)});
function harness(configuration=config(),options={}){
 const sent=[],loaded=[],tokens=[];
 const fetcher=async(url,init)=>{if(url==='/api/bridge?config'){sent.push({url});return Response.json(configuration);}sent.push({url,headers:Object.fromEntries(new Headers(init.headers)),method:init.method,body:init.body});return options.respond?options.respond(sent.filter(row=>row.url!=='/api/bridge?config').length):Response.json({ok:true});};
 const request=createBridgeTransport({fetcher,timeoutMs:options.timeoutMs??100,loadTokenSource:async value=>{loaded.push(value);if(options.loadFailure)throw Error('private provider error');return {getToken:async force=>{tokens.push(force);if(options.tokenFailure)throw Error('sensitive-token-value');if(options.hang)return new Promise(()=>{});return force?'refreshed-proof':'cached-proof';}};}});
 return {request,sent,loaded,tokens};
}
test('App Check config exposes only public identifiers and fails closed for missing/mismatched app IDs',()=>{
 const value=publicAppCheckConfig(environment);assert.equal(value.enabled,true);assert.equal(value.configured,true);assert.ok(!JSON.stringify(value).includes(environment.GEMINI_API_KEY));assert.equal(value.GEMINI_API_KEY,undefined);
 assert.deepEqual(publicAppCheckConfig({}),{enabled:false,required:false});assert.equal(publicAppCheckConfig({...environment,FIREBASE_WEB_APP_ID:'not-allowed'}).configured,false);
 for(const key of ['BRIDGE_APP_CHECK_SITE_KEY','FIREBASE_WEB_API_KEY','FIREBASE_PROJECT_ID'])assert.equal(publicAppCheckConfig({...environment,[key]:''}).configured,false);
 assert.equal(publicAppCheckConfig({...environment,FIREBASE_WEB_API_KEY:environment.GEMINI_API_KEY}).configured,false);
 assert.equal(publicAppCheckConfig({...environment,BRIDGE_APP_CHECK_ENFORCE:'false',BRIDGE_APP_CHECK_CLIENT_ENABLED:'true'}).enabled,true);
});
test('disabled demos never initialise or contact attestation SDKs',async()=>{
 const task=harness({demo:true,appCheck:{enabled:false,required:false}});await task.request('?config');await task.request('',{headers:{Authorization:'Bearer alex'}});assert.equal(task.loaded.length,0);assert.equal(task.sent.length,2);assert.equal(task.sent[1].headers['x-firebase-appcheck'],undefined);
});
test('login, authenticated requests and concurrent startup share config and carry App Check proof',async()=>{
 const task=harness();await Promise.all([task.request('?config'),task.request('?login',{method:'POST',body:'login-payload'}),task.request('',{headers:{Authorization:'Bearer user-token'}})]);
 assert.equal(task.sent.filter(row=>row.url==='/api/bridge?config').length,1);assert.equal(task.loaded.length,1);
 for(const row of task.sent.filter(row=>row.url!=='/api/bridge?config'))assert.equal(row.headers['x-firebase-appcheck'],'cached-proof');assert.ok(task.sent.some(row=>row.headers?.authorization==='Bearer user-token'));
 assert.ok(!JSON.stringify(task.loaded).includes('server-only-secret'));
});
test('invalid proof refreshes once only and preserves POST payload',async()=>{
 const task=harness(config(),{respond:count=>count===1?Response.json({error:'app-check-invalid'},{status:403}):Response.json({ok:true})});
 const response=await task.request('',{method:'POST',body:'{"action":"resolve"}'});assert.equal(response.status,200);assert.deepEqual(task.tokens,[false,true]);assert.equal(task.sent[1].body,task.sent[2].body);assert.equal(task.sent[2].headers['x-firebase-appcheck'],'refreshed-proof');
 const denied=harness(config(),{respond:()=>Response.json({error:'app-check-invalid'},{status:403})});assert.equal((await denied.request()).status,403);assert.deepEqual(denied.tokens,[false,true]);
});
test('authorization, quota and server errors never replay a mutation',async()=>{
 for(const [status,error] of [[401,'login-required'],[403,'forbidden'],[429,'rate-limited'],[500,'server-error']]){const task=harness(config(),{respond:()=>Response.json({error},{status})});assert.equal((await task.request('',{method:'POST',body:'payload'})).status,status);assert.deepEqual(task.tokens,[false]);}
});
test('missing configuration, SDK failures and deadlines block before sending a protected request',async()=>{
 const missing=harness({demo:false,appCheck:{enabled:true,required:true,configured:false}});await assert.rejects(missing.request(),/app-check-unconfigured/);assert.equal(missing.sent.length,1);
 for(const options of [{loadFailure:true},{tokenFailure:true},{hang:true,timeoutMs:5}]){const task=harness(config(),options);await assert.rejects(task.request(),error=>error.message==='app-check-unavailable');assert.equal(task.sent.length,1);}
});
test('proof cannot be forwarded to arbitrary URLs and CSP keeps unconfigured apps isolated',async()=>{
 const task=harness();await assert.rejects(task.request('https://evil.invalid/'),/invalid-api-route/);assert.equal(task.sent.length,0);
 assert.equal(appCheckCsp(false).connect,'');assert.equal(appCheckCsp(false).frame,"'none'");const csp=appCheckCsp(true);assert.ok(csp.connect.includes('content-firebaseappcheck.googleapis.com'));assert.ok(!Object.values(csp).join('').includes('*'));
 assert.ok(!appSecurityPolicy({}).includes('google.com'));assert.ok(appSecurityPolicy(environment).includes('content-firebaseappcheck.googleapis.com'));assert.ok(appSecurityPolicy(environment).includes("frame-ancestors 'none'"));
 assert.ok(!appSecurityPolicy({...environment,NODE_ENV:'production'}).includes('unsafe-eval'));assert.ok(appSecurityPolicy({NODE_ENV:'development'}).includes('unsafe-eval'));
});
import {verifyAppCheckProof} from '../lib/app-check-verifier.ts';
test('backend verifier rejects missing, forged, wrong-app and expired proof without leaking token details',async()=>{
 let calls=0;const valid={required:true,token:'test-proof',allowedAppIds:['expected-app'],verify:async()=>{calls++;return {appId:'expected-app'};}};
 await verifyAppCheckProof(valid);assert.equal(calls,1);await verifyAppCheckProof({...valid,required:false,token:null});assert.equal(calls,1);
 await assert.rejects(verifyAppCheckProof({...valid,token:null}),/app-check-required/);await assert.rejects(verifyAppCheckProof({...valid,token:'x'.repeat(10001)}),/app-check-required/);assert.equal(calls,1);
 await assert.rejects(verifyAppCheckProof({...valid,verify:async()=>({appId:'foreign-app'})}),/app-check-invalid/);
 await assert.rejects(verifyAppCheckProof({...valid,verify:async()=>{throw Error('private-token-and-key');}}),error=>error.message==='app-check-invalid');
 await assert.rejects(verifyAppCheckProof({...valid,timeoutMs:5,verify:async()=>new Promise(()=>{})}),/app-check-invalid/);
});
