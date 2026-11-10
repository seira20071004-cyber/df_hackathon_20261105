'use client';
import {useState} from 'react';
import type {Language} from '../lib/model';

import {googleSessionToken,signInGoogle,type GoogleConfig} from './google-session';
type Props={
 config?:GoogleConfig;
 demo:boolean;
 language:Language;
 busy:boolean;
 run:(work:()=>Promise<void>)=>void;
 enter:(token:string,google?:boolean)=>Promise<void>;
 submit:(token:string,payload:object)=>Promise<void>;
};

export function OrganizationEntry({config,demo,language,busy,run,enter,submit}:Props){
 const [mode,setMode]=useState<'create'|'join'>(),[token,setToken]=useState('');
 const [invitation,setInvitation]=useState('');
 const [demoSignedIn,setDemoSignedIn]=useState(false);

 async function connect(){
  if(!config)throw new Error('google-unconfigured');
  const idToken=await signInGoogle(config);
  try{await enter(idToken,true);}
  catch(error){
   if(!(error instanceof Error)||error.message!=='login-required')throw error;
   setToken(idToken);
  }
 }

 if((demo&&!demoSignedIn)||(!demo&&!token))return <div className="flow entry-actions">
  <button type="button" disabled={busy||(!demo&&!config)} onClick={()=>demo?setDemoSignedIn(true):run(connect)}>{demo?'ログイン画面を試す':'Google でログイン'}</button>
  <p className="muted">{demo?'デモではGoogleログインを模擬します。':config?'初めての方は、ログイン後に組織の作成または参加へ進みます。':'この環境ではGoogleログインが未設定です。'}</p>
 </div>;

 if(!mode)return <div className="flow entry-actions">
  <button disabled={busy} onClick={()=>setMode('create')}>組織を作成する <small>管理者向け</small></button>
  <button className="secondary" disabled={busy} onClick={()=>setMode('join')}>組織に参加する <small>招待コードをお持ちの方</small></button>
 </div>;

 return <div className="flow organization-entry">
  <div className="entry-heading"><button type="button" className="entry-back" onClick={()=>{setMode(undefined);setInvitation('');}} disabled={busy} aria-label="戻る">‹</button>
   <div><h2>{mode==='create'?'組織を作成する':'組織に参加する'}</h2><p>{mode==='create'?'管理者として職場の組織を作成します。':'管理者から届いた招待コードで参加します。'}</p></div></div>
  {demo?<><p className="notice">試用モードではサンプル組織を利用します。</p>
   {mode==='join'?<form className="flow" onSubmit={event=>{
    event.preventDefault();
    run(async()=>{if(invitation.trim()!=='123456')throw new Error('invalid-invite');await enter('linh');});
   }}><label>招待コード<input value={invitation} onChange={event=>setInvitation(event.target.value)} placeholder="123456" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off"/></label>
   <button disabled={busy}>デモ組織に参加する</button></form>:<button disabled={busy} onClick={()=>run(()=>enter('sato'))}>管理者デモを開く</button>}</>
  :<form className="flow entry-form" onSubmit={event=>{
   event.preventDefault();
   const value=String(new FormData(event.currentTarget).get('value')??'').trim();
   run(async()=>{
    const credential=await googleSessionToken();
    await submit(credential,mode==='create'?{action:'create',name:value,language}:{action:'join',code:value,language});
    await enter(credential,true);
   });
  }}><label>{mode==='create'?'組織名':'招待コード'}<input name="value" required minLength={mode==='create'?2:6} maxLength={mode==='create'?100:24} inputMode={mode==='join'?'numeric':undefined} pattern={mode==='join'?'(?:[0-9]{6}|[A-Fa-f0-9]{24})':undefined} autoComplete={mode==='join'?'one-time-code':'off'} placeholder={mode==='create'?'例：さくら株式会社':'例：123456'}/></label>
  <small>{mode==='create'?'後からメンバーを招待できます。':'招待コードが分からない場合は管理者に確認してください。'}</small>
  <button disabled={busy}>{mode==='create'?'組織を作成する':'組織に参加する'}</button></form>}
 </div>;
}
