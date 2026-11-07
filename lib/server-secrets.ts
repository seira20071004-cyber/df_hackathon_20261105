import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {applicationDefault} from 'firebase-admin/app';
export class SecretFailure extends Error {code:string;constructor(code:string){super(code);this.code=code;}}
export const secretRefPattern=/^projects\/[a-zA-Z0-9-]+\/secrets\/[a-zA-Z0-9_-]+\/versions\/(?:[1-9][0-9]*|latest)$/;
export function crc32c(bytes:Uint8Array){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0x82f63b78:0);}return (crc^0xffffffff)>>>0;}
function checked(value:string){const key=value.trim();if(!key||key.length>10000||/[\x00-\x20\x7f]/.test(key))throw new SecretFailure('secret-invalid');return key;}
const credential=applicationDefault();
export async function accessSecretVersion(ref:string,{token=async()=>(await credential.getAccessToken()).access_token,fetcher=fetch}:{token?:()=>Promise<string>;fetcher?:typeof fetch}={}){
 if(!secretRefPattern.test(ref))throw new SecretFailure('secret-invalid');
 try{const response=await fetcher('https://secretmanager.googleapis.com/v1/'+ref+':access',{method:'GET',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+await token()}});
  if(response.status===401||response.status===403)throw new SecretFailure('secret-access-denied');if(!response.ok)throw new SecretFailure('secret-unavailable');
  const body=await response.json(),data=body.payload?.data;if(typeof data!=='string'||data.length>14000||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw new SecretFailure('secret-invalid');
  const bytes=Buffer.from(data,'base64');if(bytes.toString('base64')!==data||String(crc32c(bytes))!==String(body.payload?.dataCrc32c))throw new SecretFailure('secret-invalid');
  // Google may normalize a project ID to its numeric project number in resource names.
  const requested=ref.split('/'),resolved=typeof body.name==='string'?body.name.split('/'):[];
  if(resolved.length!==6||resolved[0]!=='projects'||resolved[2]!=='secrets'||resolved[4]!=='versions'||resolved[3]!==requested[3]||!/^[1-9][0-9]*$/.test(resolved[5])||!(resolved[1]===requested[1]||!/^\d+$/.test(requested[1])&&/^\d+$/.test(resolved[1])))throw new SecretFailure('secret-invalid');
  if(requested[5]!=='latest'&&resolved[5]!==requested[5])throw new SecretFailure('secret-invalid');return checked(bytes.toString('utf8'));
 }catch(error){if(error instanceof SecretFailure)throw error;throw new SecretFailure('secret-unavailable');}
}
export function createSecretReader({read=async(path:string)=>readFile(path,'utf8'),access=accessSecretVersion,now=Date.now,ttl=30000}:{read?:(path:string)=>Promise<string>;access?:(ref:string)=>Promise<string>;now?:()=>number;ttl?:number}={}){
 let cached:{source:string;expires:number;value:string}|undefined,pending:{source:string;value:Promise<string>}|undefined;
 return async function geminiKey(env:Readonly<Record<string,string|undefined>>=process.env):Promise<string|undefined>{
  if(env.GEMINI_PROVIDER==='vertex'&&env.GEMINI_VERTEX_AUTH==='adc')return undefined;
  const ref=env.GEMINI_API_KEY_SECRET?.trim(),file=env.GEMINI_API_KEY_FILE?.trim();
  const local=env.BRIDGE_DEMO==='true'||env.NODE_ENV==='development';
  if(ref&&(!secretRefPattern.test(ref)||!local&&ref.endsWith('/latest')))throw new SecretFailure('secret-invalid');
  if(file&&!isAbsolute(file))throw new SecretFailure('secret-invalid');
  if(!ref&&!file){if(!env.GEMINI_API_KEY)return undefined;if(!local)throw new SecretFailure('secret-manager-required');return checked(env.GEMINI_API_KEY);}
  const source=ref?'secret:'+ref:'file:'+file;if(cached?.source===source&&cached.expires>now())return cached.value;
  if(pending?.source===source)return pending.value;
  const promise=(async()=>{try{const value=checked(ref?await access(ref):await read(file!));cached={source,value,expires:now()+ttl};return value;}
   catch(error){cached=undefined;if(error instanceof SecretFailure)throw error;throw new SecretFailure('secret-unavailable');}finally{if(pending?.source===source)pending=undefined;}})();
  pending={source,value:promise};return promise;
 };
}
export const serverGeminiKey=createSecretReader();
