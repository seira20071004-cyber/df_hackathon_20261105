import {NextRequest,NextResponse} from 'next/server';
import {getAppCheck} from 'firebase-admin/app-check';
import {applicationDefault,getApps,initializeApp} from 'firebase-admin/app';
import {authenticate,isDemo} from '../../../lib/storage';
import {actionSchema,ApiError,execute,workspace} from '../../../lib/workflow';
import {audit,loginLimit,requestLimit,SecurityError,securityContext} from '../../../lib/security-runtime';
import type {Profile} from '../../../lib/model';
import {publicAppCheckConfig} from '../../../lib/app-check-config';
import {verifyAppCheckProof,AppCheckDenied} from '../../../lib/app-check-verifier';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=300;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(status===429?{'Retry-After':'60'}:{})}});
async function readJson(request:NextRequest,max:number){
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new SecurityError(415,'invalid-content-type');
 if(Number(request.headers.get('content-length'))>max)throw new SecurityError(413,'request-too-large');
 const reader=request.body?.getReader();if(!reader)throw new SecurityError(400,'invalid-input');const chunks:Uint8Array[]=[];let bytes=0;
 for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>max){await reader.cancel();throw new SecurityError(413,'request-too-large');}chunks.push(next.value);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new SecurityError(400,'invalid-input');}
}
async function appCheck(request:NextRequest){
 try{await verifyAppCheckProof({required:process.env.BRIDGE_APP_CHECK_ENFORCE==='true',token:request.headers.get('X-Firebase-AppCheck'),
  allowedAppIds:(process.env.BRIDGE_APP_CHECK_APP_IDS??'').split(',').map(value=>value.trim()).filter(Boolean),verify:async token=>{
   const app=getApps()[0]??initializeApp({credential:applicationDefault(),projectId:process.env.FIREBASE_PROJECT_ID});return getAppCheck(app).verifyToken(token);
  }});}catch(error){if(error instanceof AppCheckDenied)throw new SecurityError(403,error.code);throw error;}
}
async function run(request:NextRequest){
 let profile:Profile|null=null,operation='request',resourceId:string|undefined;
 try{
  if(isDemo()&&process.env.NODE_ENV==='production'&&process.env.BRIDGE_ALLOW_PUBLIC_DEMO!=='true')throw new SecurityError(503,'demo-disabled-in-production');
  if(request.method==='GET'&&request.nextUrl.searchParams.has('config'))return reply({demo:isDemo(),appCheck:publicAppCheckConfig(process.env)});
  if(request.method==='POST'){
   const origin=request.headers.get('origin');const allowed=(process.env.BRIDGE_ALLOWED_ORIGINS??'').split(',').filter(Boolean);
   if(origin&&origin!==request.nextUrl.origin&&!allowed.includes(origin))throw new SecurityError(403,'origin-denied');
  }
  await appCheck(request);
  if(request.method==='POST'&&request.nextUrl.searchParams.has('login')){
   operation='login';await loginLimit();if(isDemo()||!process.env.FIREBASE_WEB_API_KEY)return reply({error:'firebase-unconfigured'},503);
   const body=await readJson(request,8000);
   if(!body||typeof body.email!=='string'||typeof body.password!=='string'||body.email.length>254||body.password.length>4096)throw new SecurityError(400,'invalid-input');
   const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+encodeURIComponent(process.env.FIREBASE_WEB_API_KEY),{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(10000),body:JSON.stringify({email:body.email,password:body.password,returnSecureToken:true})});
   const result=await response.json();profile=response.ok?await authenticate(result.idToken):null;
   if(!profile)throw new SecurityError(401,'login-failed');await audit({actorId:profile.id,organizationId:profile.organizationId,action:'login',result:'success'});return reply({token:result.idToken});
  }
  const header=request.headers.get('authorization')??'';if(header.length>10000||!header.startsWith('Bearer '))throw new SecurityError(401,'login-required');
  profile=await authenticate(header.slice(7),request.headers.get('X-Bridge-Organization')??undefined);if(!profile)throw new SecurityError(401,'login-required');
  await requestLimit(profile);
  return await securityContext.run(profile,async()=>{
   if(request.method==='GET')return reply(await workspace(profile!));
   const raw=await readJson(request,2_400_000),input=actionSchema.safeParse(raw);if(!input.success||Object.keys(raw).some(key=>!Object.hasOwn(input.data,key)))throw new SecurityError(400,'invalid-input');
   operation=input.data.action;resourceId='id' in input.data?input.data.id:undefined;
   const event={actorId:profile!.id,organizationId:profile!.organizationId,action:operation,resourceId};
   await audit({...event,action:operation+'_authorized',result:'success'});
   const result=await execute(profile!,input.data);await audit({...event,result:'success'});return reply(result);
  });
 }catch(error){
  const status=error instanceof ApiError||error instanceof SecurityError?error.status:500;
  const code=error instanceof ApiError?error.message:error instanceof SecurityError?error.code:'server-error';
  await audit({actorId:profile?.id,organizationId:profile?.organizationId,action:operation,result:status<500?'denied':'failed',code,resourceId}).catch(()=>undefined);
  return reply({error:code},status);
 }
}
export const GET=run;export const POST=run;
