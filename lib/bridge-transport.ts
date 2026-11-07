import {appCheckConfigSchema,type PublicAppCheck} from './app-check-schema.ts';
type TokenSource={getToken:(forceRefresh:boolean)=>Promise<string>};
type Options={fetcher:typeof fetch;loadTokenSource:(config:Extract<PublicAppCheck,{enabled:true}>)=>Promise<TokenSource>;timeoutMs?:number};
const configSchema=(value:unknown)=>{const data=value as {demo?:unknown;appCheck?:unknown;photoIntake?:unknown};if(!data||typeof data.demo!=='boolean')throw new Error('app-check-unavailable');return {demo:data.demo,...(typeof data.photoIntake==='boolean'?{photoIntake:data.photoIntake}:{}),appCheck:appCheckConfigSchema.parse(data.appCheck),googleAuth:(data as {googleAuth?:unknown}).googleAuth};};
async function deadline<T>(work:Promise<T>,ms:number):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('app-check-unavailable')),ms);})]);}finally{if(timer)clearTimeout(timer);}}
export function createBridgeTransport({fetcher,loadTokenSource,timeoutMs=15000}:Options){
 let configuration:Promise<ReturnType<typeof configSchema>>|undefined,source:Promise<TokenSource>|undefined;
 function config(){if(!configuration)configuration=fetcher('/api/bridge?config',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(timeoutMs)}).then(async response=>{if(!response.ok)throw new Error('app-check-unavailable');return configSchema(await response.json());}).catch(error=>{configuration=undefined;throw error;});return configuration;}
 async function headers(force=false){const {appCheck}=await config();if(!appCheck.enabled)return {};
  if(!appCheck.configured||!appCheck.siteKey||!appCheck.firebase)throw new Error('app-check-unconfigured');
  try{if(!source)source=loadTokenSource(appCheck).catch(error=>{source=undefined;throw error;});const token=await deadline((await deadline(source,timeoutMs)).getToken(force),timeoutMs);
   if(typeof token!=='string'||!token.trim()||token.length>10000)throw Error();return {'X-Firebase-AppCheck':token};
  }catch{throw new Error('app-check-unavailable');}
 }
 return async function bridgeFetch(suffix='',init:RequestInit={}){
  if(!['','?config','?login','?onboard','?invite'].includes(suffix)&&!/^\?sourcePdf=[a-f0-9]{64}&site=[A-Za-z0-9_-]{1,120}(?:&manual=[A-Za-z0-9_-]{1,120}&version=[A-Za-z0-9%:._-]{1,120})?(?:&page=(?:[1-9]|10))?$/.test(suffix))throw new Error('invalid-api-route');
  if(suffix==='?config')return Response.json(await config());
  const send=async(force:boolean)=>{const outgoing=new Headers(init.headers);const proof=await headers(force);for(const [key,value] of Object.entries(proof))outgoing.set(key,value);return fetcher('/api/bridge'+suffix,{...init,credentials:'same-origin',cache:'no-store',headers:outgoing});};
  const response=await send(false);
  // Rejected App Check requests have not reached authentication or mutation.
  if(response.status===403){const error=await response.clone().json().catch(()=>({}));if(error.error==='app-check-invalid')return send(true);}
  return response;
 };
}
