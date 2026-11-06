import {createHash,randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {applicationDefault,getApps,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import type {Profile} from './model';
import {localInspect} from './security-content.ts';
export const securityContext=new AsyncLocalStorage<Profile>();
const memory=new Map<string,any>();let sequence=Promise.resolve();
const app=()=>getApps()[0]??initializeApp({credential:applicationDefault(),projectId:process.env.FIREBASE_PROJECT_ID});
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export class SecurityError extends Error {status:number;code:string;constructor(status:number,code:string){super(code);this.status=status;this.code=code;}}
export type LimitState={window:number;count:number;active:Record<string,number>};
export function reserve(state:LimitState|undefined,limit:number,concurrency:number,leaseId:string|null,now=Date.now()){
 const window=Math.floor(now/60000),current:LimitState=state?.window===window?structuredClone(state):{window,count:0,active:{...(state?.active??{})}};
 current.active=Object.fromEntries(Object.entries(current.active).filter(([,expires])=>expires>now));
 if(current.count>=limit||leaseId&&Object.keys(current.active).length>=concurrency)throw new SecurityError(429,'rate-limited');
 current.count++;if(leaseId)current.active[leaseId]=now+120000;return current;
}
async function atomic<T>(key:string,work:(state:any)=>{state:any;result:T}){
 if(process.env.BRIDGE_DEMO==='true'){
  const task=sequence.then(()=>{const next=work(memory.get(key));memory.set(key,next.state);return next.result;});sequence=task.then(()=>undefined,()=>undefined);return task;
 }
 const doc=getFirestore(app()).collection('_bridgeSecurityLimits').doc(hash(key));
 return doc.firestore.runTransaction(async tx=>{const next=work((await tx.get(doc)).data());tx.set(doc,{...next.state,expireAt:new Date(Date.now()+86400000)});return next.result;});
}
const limit=(name:string,fallback:number)=>{const value=Number(process.env[name]);return Number.isInteger(value)&&value>0&&value<=20000?value:fallback;};
export async function requestLimit(profile:Profile){
 await atomic('user:'+profile.id,state=>({state:reserve(state,limit('BRIDGE_USER_REQUESTS_PER_MINUTE',90),0,null),result:true}));
 await atomic('org:'+profile.organizationId,state=>({state:reserve(state,limit('BRIDGE_ORG_REQUESTS_PER_MINUTE',900),0,null),result:true}));
}
export async function loginLimit(){await atomic('login-global',state=>({state:reserve(state,20,0,null),result:true}));}
export async function withAiLimit<T>(work:()=>Promise<T>){
 const profile=securityContext.getStore();if(!profile){if(process.env.BRIDGE_DEMO==='true')return work();throw new SecurityError(503,'ai-context-required');}
 const key='ai:'+profile.organizationId,id=randomUUID();
 await atomic(key,state=>({state:reserve(state,limit('BRIDGE_AI_CALLS_PER_MINUTE',60),limit('BRIDGE_AI_CONCURRENCY',4),id),result:true}));
 try{return await work();}finally{await atomic(key,state=>{if(state?.active)delete state.active[id];return {state:state??{window:0,count:0,active:{}},result:true};}).catch(()=>undefined);}
}
export type AuditEvent={actorId?:string;organizationId?:string;action:string;result:'success'|'denied'|'failed';code?:string;resourceId?:string};
export async function audit(event:AuditEvent){
 // Accept identifiers and fixed operation codes only; never log request bodies or provider errors.
 const safe=(value:string|undefined)=>value&&/^[a-zA-Z0-9_:@.-]{1,180}$/.test(value)?localInspect(value).findings.length?'sha256:'+hash(value):value:undefined;
 const row=Object.fromEntries(Object.entries({at:new Date().toISOString(),actorId:safe(event.actorId),organizationId:safe(event.organizationId),action:safe(event.action)??'request',result:event.result,code:safe(event.code),resourceHash:event.resourceId?hash(event.resourceId):undefined}).filter(([,value])=>value!==undefined));
 console.info(JSON.stringify({severity:event.result==='success'?'INFO':'WARNING',message:'bridge_security_audit',...row}));
 if(process.env.BRIDGE_DEMO!=='true'&&event.organizationId){try{await getFirestore(app()).collection('organizations').doc(event.organizationId).collection('auditLogs').add(row);}catch{console.error(JSON.stringify({severity:'ERROR',message:'bridge_audit_persistence_failed'}));throw new SecurityError(503,'audit-unavailable');}}
}
