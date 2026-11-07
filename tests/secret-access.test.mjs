import test from 'node:test';
import assert from 'node:assert/strict';
import {accessSecretVersion,createSecretReader,crc32c,SecretFailure} from '../lib/server-secrets.ts';
import {mayViewManual,publishableAccess,accessPolicySchema} from '../lib/manual-access.ts';
import {protectAiData} from '../lib/privacy.ts';
import {seedDemo} from '../lib/demo.ts';
import {releasedManual,publicationHash,publicManual} from '../lib/publication.ts';
const ref='projects/fictional-project/secrets/test-dev/versions/1';
const env={NODE_ENV:'production',GEMINI_API_KEY_SECRET:ref,GEMINI_API_KEY:'must-not-fall-back'};
test('Secret Manager authorization denial never falls back or exposes provider body',async()=>{
 const reader=createSecretReader({access:async()=>{throw new SecretFailure('secret-access-denied');}});
 await assert.rejects(reader(env),{message:'secret-access-denied'});
 await assert.rejects(accessSecretVersion(ref,{token:async()=>'fictional-token',fetcher:async()=>new Response('private-provider-body',{status:403})}),{message:'secret-access-denied'});
});
test('Secret Manager verifies payload integrity, resource and pinned version',async()=>{
 const bytes=Buffer.from('fictional-test-key'),payload={data:bytes.toString('base64'),dataCrc32c:String(crc32c(bytes))};
 assert.equal(crc32c(Buffer.from('123456789')),0xe3069283);
 const get=body=>accessSecretVersion(ref,{token:async()=>'fictional-token',fetcher:async url=>{assert.equal(url,'https://secretmanager.googleapis.com/v1/'+ref+':access');return Response.json(body);}});
 assert.equal(await get({name:ref,payload}),'fictional-test-key');
 assert.equal(await get({name:ref.replace('fictional-project','123456789'),payload}),'fictional-test-key');
 for(const body of [{name:ref,payload:{...payload,dataCrc32c:'0'}},{name:ref.replace('/1','/2'),payload},{name:ref.replace('test-dev','other-secret'),payload},{name:ref.replace('fictional-project','other-project'),payload}])await assert.rejects(get(body),{message:'secret-invalid'});
});
test('secret cache coalesces requests, expires for rotation and never returns stale data on failure',async()=>{
 let time=0,calls=0,fail=false;const reader=createSecretReader({now:()=>time,ttl:30,access:async()=>{calls++;if(fail)throw new SecretFailure('secret-unavailable');return 'version-'+calls;}});
 assert.deepEqual(await Promise.all([reader(env),reader(env)]),['version-1','version-1']);assert.equal(calls,1);
 time=31;assert.equal(await reader(env),'version-2');time=62;fail=true;await assert.rejects(reader(env),{message:'secret-unavailable'});assert.equal(calls,3);
});
test('production disallows literal keys, relative mounts and latest; ADC never requests an API key',async()=>{
 let calls=0;const reader=createSecretReader({access:async()=>{calls++;return 'test';},read:async()=>{throw Error('file contains private details');}});
 await assert.rejects(reader({...env,GEMINI_API_KEY_SECRET:undefined}),{message:'secret-manager-required'});
 await assert.rejects(reader({...env,GEMINI_API_KEY_SECRET:ref.replace('/1','/latest')}),{message:'secret-invalid'});
 await assert.rejects(reader({...env,GEMINI_API_KEY_SECRET:undefined,GEMINI_API_KEY_FILE:'relative.txt'}),{message:'secret-invalid'});
 await assert.rejects(reader({...env,GEMINI_API_KEY_SECRET:undefined,GEMINI_API_KEY_FILE:'C:/fictional/missing'}),{message:'secret-unavailable'});
 assert.equal(await reader({...env,GEMINI_PROVIDER:'vertex',GEMINI_VERTEX_AUTH:'adc'}),undefined);assert.equal(calls,0);
});
test('prohibited input blocks before cloud inspection and Gemini; ordinary PII can be masked',async()=>{
 const previous={...process.env};try{process.env.BRIDGE_DEMO='true';process.env.BRIDGE_PRIVACY_STRICT='true';process.env.BRIDGE_SENSITIVE_PROVIDER='google-dlp';let inspections=0,geminiCalls=0;
 const cloudInspect=async()=>{inspections++;return [];};
 const run=async data=>{const safe=await protectAiData(data,{cloudInspect});geminiCalls++;return safe;};
 for(const text of ['password: x','{"api_key":"example"}','Bearer fictional-test-token','社外秘: test','-----BEGIN PRIVATE KEY-----\ntest'])await assert.rejects(run({text}),{message:'sensitive-input-blocked'});
 assert.equal(inspections,0);assert.equal(geminiCalls,0);
 const safe=await run({text:'連絡先 person@example.com'});assert.ok(!safe.text.includes('person@example.com'));assert.equal(geminiCalls,1);
 await assert.rejects(protectAiData({text:'ordinary'},{cloudInspect:async()=>[{infoType:{name:'PASSWORD'},location:{byteRange:{start:0,end:8}}}]}),{message:'sensitive-input-blocked'});
 await assert.rejects(protectAiData({text:'ordinary'},{cloudInspect:async()=>{throw Error('private-service-error');}}),{message:'privacy-unavailable'});
 }finally{process.env=previous;}
});
test('manual levels enforce organization, site, role, assignment and restricted publication',()=>{
 const manual=seedDemo().manuals[0],employee={id:'alex',role:'employee',organizationId:manual.organizationId,siteIds:[manual.siteId]},manager={...employee,role:'manager'};
 for(const level of ['PUBLIC','INTERNAL']){const row={...manual,access:{level,allowedRoles:['manager','employee'],allowedUserIds:[]}};assert.ok(mayViewManual(employee,row));assert.equal(mayViewManual({...employee,organizationId:'other'},row),false);assert.equal(mayViewManual({...employee,siteIds:[]},row),false);}
 const confidential={...manual,access:{level:'CONFIDENTIAL',allowedRoles:['manager','employee'],allowedUserIds:['alex']}};
 assert.ok(mayViewManual(employee,confidential));assert.equal(mayViewManual({...employee,id:'linh'},confidential),false);assert.ok(mayViewManual(manager,confidential));
 assert.equal(mayViewManual(employee,{...confidential,access:{...confidential.access,allowedRoles:['manager']}}),false);
 const restricted={...manual,access:{...confidential.access,level:'RESTRICTED'}};assert.equal(publishableAccess(restricted),false);assert.equal(mayViewManual(employee,restricted),false);assert.ok(mayViewManual(manager,restricted));assert.equal(releasedManual(restricted),undefined);
 assert.equal(publishableAccess({...confidential,access:{...confidential.access,allowedUserIds:[]}}),false);
 assert.equal(mayViewManual(employee,{...manual,access:{level:'invalid'}}),false);assert.equal(accessPolicySchema.safeParse({level:'PUBLIC',allowedRoles:['admin'],allowedUserIds:[]}).success,false);
 assert.notEqual(publicationHash(manual),publicationHash(confidential));assert.equal(publicManual(confidential).access,undefined);assert.equal(publicManual(confidential).confidentiality,'CONFIDENTIAL');
});
