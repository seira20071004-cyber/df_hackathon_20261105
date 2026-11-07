'use client';
import {useState} from 'react';
import type {Language} from '../lib/model';

export type GoogleConfig={projectId:string;apiKey:string;authDomain:string};
type Props={
 config?:GoogleConfig;
 demo:boolean;
 language:Language;
 busy:boolean;
 run:(work:()=>Promise<void>)=>void;
 enter:(token:string)=>Promise<void>;
 submit:(token:string,payload:object)=>Promise<void>;
};

export function OrganizationEntry({config,demo,language,busy,run,enter,submit}:Props){
 const [mode,setMode]=useState<'create'|'join'>(),[token,setToken]=useState('');
 const [invitation,setInvitation]=useState('');

 async function connect(){
  if(!config)throw new Error('google-unconfigured');
  const [{getApps,initializeApp},{getAuth,GoogleAuthProvider,signInWithPopup,setPersistence,inMemoryPersistence}]=await Promise.all([import('firebase/app'),import('firebase/auth')]);
  const name='bridge-work-login';
  const app=getApps().find(app=>app.name===name)??initializeApp(config,name);
  const auth=getAuth(app);
  await setPersistence(auth,inMemoryPersistence);
  const credential=await signInWithPopup(auth,new GoogleAuthProvider()).catch(()=>{throw new Error('google-login-failed');});
  const idToken=await credential.user.getIdToken();
  try{await enter(idToken);}
  catch(error){
   if(!(error instanceof Error)||error.message!=='login-required')throw error;
   setToken(idToken);
  }
 }

 if(!mode)return <div className="flow entry-actions">
  <button disabled={busy} onClick={()=>setMode('create')}>組織を作成する <small>管理者向け</small></button>
  <button className="secondary" disabled={busy} onClick={()=>setMode('join')}>組織に参加する <small>招待コードをお持ちの方</small></button>
  {config&&!demo&&<button className="link" disabled={busy} onClick={()=>{setMode('join');run(connect);}}>既存アカウントで Google ログイン</button>}
 </div>;

 return <div className="flow organization-entry">
  <div className="screen-title"><button type="button" className="screen-back" aria-label="戻る" onClick={()=>{setMode(undefined);setToken('');setInvitation('');}} disabled={busy}>‹</button>
   <h2>{mode==='create'?'組織を作成する':'組織に参加する'}</h2></div>
  <ol className="entry-steps">
   <li>Googleでログイン</li>
   <li>{mode==='create'?'組織名を入力':'招待コードを入力'}</li>
   <li>{mode==='create'?'組織を作成':'組織に参加'}</li>
  </ol>
  {demo?<><p className="notice">試用モードではサンプル組織を利用します。</p>
   {mode==='join'?<form className="flow" onSubmit={event=>{
    event.preventDefault();
    run(async()=>{if(invitation.trim().toUpperCase()!=='DEMO2026')throw new Error('invalid-invite');await enter('linh');});
   }}><label>招待コード<input value={invitation} onChange={event=>setInvitation(event.target.value)} placeholder="DEMO2026" required autoCapitalize="characters" autoComplete="off"/></label>
   <button disabled={busy}>デモ組織に参加する</button></form>:<button disabled={busy} onClick={()=>run(()=>enter('sato'))}>管理者デモを開く</button>}</>
  :!config?<p className="notice">この環境ではGoogleログインが未設定です。</p>
  :!token?<button className="secondary google-login" disabled={busy} onClick={()=>run(connect)}><span aria-hidden="true">G</span> Google でログイン</button>
  :<form className="flow" onSubmit={event=>{
   event.preventDefault();
   const value=String(new FormData(event.currentTarget).get('value')??'').trim();
   run(async()=>{await submit(token,mode==='create'?{action:'create',name:value,language}:{action:'join',code:value,language});await enter(token);});
  }}><label>{mode==='create'?'組織名':'招待コード'}<input name="value" required minLength={mode==='create'?2:24} maxLength={mode==='create'?100:24} autoComplete="off" autoCapitalize={mode==='join'?'characters':'none'}/></label>
  <button disabled={busy}>{mode==='create'?'作成する':'参加する'}</button></form>}
 </div>;
}
