'use client';
import {useState} from 'react';
import type {Language} from '../lib/model';
export type GoogleConfig={projectId:string;apiKey:string;authDomain:string};
export function OrganizationEntry({config,language,busy,run,enter,submit}:{config:GoogleConfig;language:Language;busy:boolean;run:(work:()=>Promise<void>)=>void;enter:(token:string)=>Promise<void>;submit:(token:string,payload:object)=>Promise<void>}){
 const [mode,setMode]=useState<'create'|'join'>(),[token,setToken]=useState('');
 async function connect(){
  const [{getApps,initializeApp},{getAuth,GoogleAuthProvider,signInWithPopup,setPersistence,inMemoryPersistence}]=await Promise.all([import('firebase/app'),import('firebase/auth')]);
  const name='bridge-work-login',app=getApps().find(app=>app.name===name)??initializeApp(config,name),auth=getAuth(app);
  await setPersistence(auth,inMemoryPersistence);
  const credential=await signInWithPopup(auth,new GoogleAuthProvider()).catch(()=>{throw new Error('google-login-failed');});
  const idToken=await credential.user.getIdToken();
  try{await enter(idToken);}catch(error){if(!(error instanceof Error)||error.message!=='login-required')throw error;setToken(idToken);}
 }
 if(!mode)return <div className="flow">
  <button disabled={busy} onClick={()=>setMode('create')}>組織を作成する <small>管理者向け</small></button>
  <button className="secondary" disabled={busy} onClick={()=>setMode('join')}>組織に参加する <small>招待コードをお持ちの方</small></button>
  <button className="link" disabled={busy} onClick={()=>{setMode('join');run(connect);}}>既存アカウントで Google ログイン</button>
 </div>;
 return <div className="flow"><button className="link" onClick={()=>{setMode(undefined);setToken('');}} disabled={busy}>← 戻る</button>
  <h2>{mode==='create'?'組織を作成する':'組織に参加する'}</h2>
  {!token?<button className="secondary" disabled={busy} onClick={()=>run(connect)}>Google でログイン</button>:<form className="flow" onSubmit={event=>{
   event.preventDefault();const value=String(new FormData(event.currentTarget).get('value')??'');
   run(async()=>{await submit(token,mode==='create'?{action:'create',name:value,language}:{action:'join',code:value,language});await enter(token);});
  }}><label>{mode==='create'?'組織名':'招待コード'}<input name="value" required minLength={mode==='create'?2:24} maxLength={mode==='create'?100:24} autoComplete="off" autoCapitalize={mode==='join'?'characters':'none'}/></label>
  <button disabled={busy}>{mode==='create'?'作成する':'参加する'}</button></form>}
 </div>;
}
