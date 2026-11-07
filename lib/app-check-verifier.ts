export class AppCheckDenied extends Error {code:string;constructor(code:string){super(code);this.code=code;}}
export async function verifyAppCheckProof({required,token,allowedAppIds,verify,timeoutMs=8000}:{required:boolean;token:string|null;allowedAppIds:string[];verify:(token:string)=>Promise<{appId:string}>;timeoutMs?:number}){
 if(!required)return;
 if(!token||token.length>10000)throw new AppCheckDenied('app-check-required');
 if(!allowedAppIds.length)throw new AppCheckDenied('app-check-invalid');
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const result=await Promise.race([verify(token),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error()),timeoutMs);})]);
  if(!allowedAppIds.includes(result.appId))throw Error();
 }catch{throw new AppCheckDenied('app-check-invalid');}finally{if(timer)clearTimeout(timer);}
}
