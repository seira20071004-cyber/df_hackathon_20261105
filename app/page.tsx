'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { copy } from '../lib/copy';
import { ManualReview, ManualView, isGenerating, hasManualContent } from './manual';
import {PendingDots} from './pending-dots';
import {ConsultationRouting,type ConsultationStage} from './consultation-routing';
import {ManualInbox,ManualSend} from './manual-delivery';
import {DocumentLibrary} from './document-library';
import {AdaptiveIntake} from './adaptive-intake';
import {ChatMessages} from './chat-messages';
import type {AdaptiveDetails} from '../lib/adaptive';
import {OrganizationEntry} from './organization-entry';
import {GOOGLE_SESSION,googleAuthClient,googleSessionToken,signOutGoogle,type GoogleConfig} from './google-session';
import {Brand,Settings,WorkspaceShell,type AppTab} from './workspace-shell';
import {bridgeFetch} from './app-check';
import type {ManualEvent} from './manual-guide';
import { languageNames, languages, type Language, type Manual, type Match, type Question, type Workspace } from '../lib/model';

const focusSearchResults = (heading: HTMLHeadingElement | null) => heading?.focus();
const siteName = (id: string) => id === 'sakura' ? 'Sakura Building' : id;
type SpeechInput = {
  lang: string;
  onresult: ((event: {results: ArrayLike<ArrayLike<{transcript: string}>>}) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
};
function speechRecognition() {
  const browser = window as Window & {SpeechRecognition?: new () => SpeechInput; webkitSpeechRecognition?: new () => SpeechInput};
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

function Badge({children, variant = ''}: {children: ReactNode; variant?: string}) {
  return <span className={'badge ' + variant}>{children}</span>;
}
export default function BridgeWork() {
  const [token,setToken] = useState('');
  const [data,setData] = useState<Workspace>();
  const [googleAuth,setGoogleAuth]=useState<GoogleConfig>();
  const [invite,setInvite]=useState<{code:string;expiresAt:string}>();
  const [demo,setDemo] = useState<boolean>();
  const [photoEnabled,setPhotoEnabled]=useState(false);
  const [photo,setPhoto]=useState<{data:string;name:string}>();
  const [language,setLanguage] = useState<Language>('ja');
  const [tab,setTab] = useState<AppTab>('home');
  const [site,setSite] = useState('');
  const [selected,setSelected] = useState('');
  const [manualId,setManualId] = useState('');
  const [manualStatus,setManualStatus] = useState<Manual['status']>('draft');
  const [query,setQuery] = useState('');
  const [results,setResults] = useState<{matches: Match[]; ai: boolean;adaptive?:AdaptiveDetails;photoAnalyzed?:boolean}>();
  const [consultOpen,setConsultOpen]=useState(false);
  const [reported,setReported]=useState('');
  const [searching,setSearching]=useState(false);
  const [consultationStage,setConsultationStage]=useState<ConsultationStage>('urgency');
  const [emergencyContact,setEmergencyContact]=useState<{contact:string;instructions:string}>();
  const [faqOnly,setFaqOnly]=useState(false);
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [reuseConfirmed,setReuseConfirmed] = useState(false);
  const [statusFilter,setStatusFilter] = useState<Question['status']>('new');
  const [historyOnly,setHistoryOnly]=useState(false);
  const [voiceSupported,setVoiceSupported] = useState(false);
  const [listening,setListening] = useState(false);
  const t = (key: Parameters<typeof copy>[1]) => copy(language,key);

  const request = useCallback(async <T,>(auth: string, payload?: object, suffix = ''): Promise<T> => {
    const credential=auth===GOOGLE_SESSION?await googleSessionToken():auth;
    const response = await bridgeFetch(suffix, {
      cache: 'no-store', method: payload ? 'POST' : 'GET',
      headers: {Authorization: 'Bearer ' + credential, ...(payload ? {'Content-Type':'application/json'} : {})},
      body: payload ? JSON.stringify(payload) : undefined
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'server-error');
    return result as T;
  }, []);
  const refresh = useCallback(async (auth: string) => {
    const next = await request<Workspace>(auth);
    setData(next);
    return next;
  }, [request]);
  const enter = useCallback(async (auth: string,google=false) => {
    const next = await refresh(auth);
    const cached = localStorage.getItem('bridge-language-' + next.profile.id);
    setLanguage(languages.find(code => code === cached) ?? next.profile.preferredLanguage);
    setSite(next.profile.siteIds[0]);
    setTab(next.profile.role==='manager'?'cases':'home');
    const session=google?GOOGLE_SESSION:auth;
    sessionStorage.setItem('bridge-token',session);
    setToken(session);
  }, [refresh]);
  useEffect(() => {
    let cancelled=false;
    request<{demo:boolean;googleAuth?:GoogleConfig;photoIntake?:boolean}>('',undefined,'?config').then(async value=>{
      if(cancelled)return;
      setDemo(value.demo);setGoogleAuth(value.googleAuth);setPhotoEnabled(Boolean(value.photoIntake));
      const saved=sessionStorage.getItem('bridge-token');
      if(!saved)return;
      try{
        if(saved===GOOGLE_SESSION){if(!value.googleAuth)throw new Error('login-required');await googleAuthClient(value.googleAuth);}
        if(!cancelled)await enter(saved);
      }catch{if(!cancelled)sessionStorage.removeItem('bridge-token');}
    }).catch(()=>{if(!cancelled)setError('app-check-unavailable');});
    return ()=>{cancelled=true;};
  }, [enter,request]);
  useEffect(() => {document.documentElement.lang = language;}, [language]);
  useEffect(() => {setVoiceSupported(Boolean(speechRecognition()));}, []);
  useEffect(() => {
    if (!token || busy) return;
    const timer = setInterval(() => {if (!document.hidden) refresh(token).catch(() => undefined);}, data?.manuals.some(isGenerating) ? 2500 : 10000);
    return () => clearInterval(timer);
  }, [token,busy,refresh,data?.manuals]);

  async function run(work: () => Promise<void>) {
    setBusy(true); setError('');
    try {await work();} catch (caught) {setError(caught instanceof Error ? caught.message : 'server-error');}
    finally {setBusy(false);}
  }
  function changeTab(next: AppTab) {setTab(next);setError('');if(next==='home'){setPhoto(undefined);setConsultOpen(false);setResults(undefined);setManualId('');}if(next==='cases')setSelected('');}
  function changeLanguage(next:Language) {
    if(!data)return;setLanguage(next);setResults(undefined);localStorage.setItem('bridge-language-'+data.profile.id,next);
    request(token,{action:'language',language:next}).catch(()=>setError('server-error'));
  }
  function changeSite(next:string){setInvite(undefined);setSite(next);setSelected('');setManualId('');setResults(undefined);}
  function signOut(){
    setPhoto(undefined);setInvite(undefined);setConsultOpen(false);
    if(googleAuth)void signOutGoogle().catch(()=>undefined);
    sessionStorage.removeItem('bridge-token');setToken('');setData(undefined);setLanguage('ja');setQuery('');setResults(undefined);setSelected('');
    setManualId('');setMessage('');setReuseConfirmed(false);setError('');setTab('home');setStatusFilter('new');
  }
  function openCase(id: string) {
    changeTab('cases');setSelected(id); setMessage(''); setReuseConfirmed(false);
  }
  function openManual(id: string) {
    setManualId(id);
    const next = data?.manuals.find(manual=>manual.id===id);
    if (next) {setManualStatus(next.status);setFaqOnly(next.kind==='faq');}
    changeTab('manuals');
  }
  function dictate(target:'question'|'reply'='question') {
    const Recognition = speechRecognition();
    if (!Recognition) return;
    const input = new Recognition();
    input.lang = {ja:'ja-JP', en:'en-US', vi:'vi-VN'}[language];
    input.onresult = event => {
      const spoken = event.results[0]?.[0]?.transcript;
      if (spoken) {
        (target==='reply'?setMessage:setQuery)(current => (current ? current + ' ' + spoken : spoken).slice(0,3000));
        setResults(undefined);
      }
    };
    input.onerror = () => {setListening(false);setError('voice-error');};
    input.onend = () => setListening(false);
    try {setError('');input.start();setListening(true);}
    catch {setError('voice-error');}
  }
  const manager = data?.profile.role === 'manager';
  const questions = (data?.questions.filter(row => row.siteId === site) ?? [])
    .sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||b.id.localeCompare(a.id));
  const manuals = data?.manuals.filter(row => row.siteId === site) ?? [];
  const pendingHistory=new Set(manuals.filter(row=>row.generation?.error==='source-review-required').flatMap(row=>row.sourceQuestionIds));
  const question = questions.find(row => row.id === selected);
  const visibleQuestions=manager?questions.filter(row=>row.status===statusFilter):questions;
  const manual = manuals.find(row => row.id === manualId);
  const chatPeer=question&&(manager?data?.staff.find(person=>person.id===question.employeeId)?.name:question.assigneeName);
  const reviewItems=manuals.filter(row=>row.status===manualStatus&&(row.kind==='faq')===faqOnly);
  const reviewManual=reviewItems.find(row=>row.id===manualId);
  const deliveries=data?.deliveries.filter(row=>row.siteId===site) ?? [];
  const unread=manager?0:deliveries.filter(row=>!row.readAt).length;
  const send=useCallback(<T,>(payload:object)=>request<T>(token,{siteId:site,...payload}),[request,token,site]);
  const requestChatTranslations=useCallback((messageIds:string[])=>send<{translations:{id:string;text:string|null|false}[]}>({action:'chatTranslations',id:selected,messageIds,language}),[send,selected,language]);
  const previewScope=JSON.stringify([data?.profile.id,site,language]);
  const [previews,setPreviews]=useState<{scope:string;texts:Map<string,string|null>}>();
  const previewTexts=previews?.scope===previewScope?previews.texts:undefined;
  const previewIds=JSON.stringify(tab==='cases'?visibleQuestions.filter(row=>row.originalLanguage!==language&&
    !(language==='ja'&&row.japaneseText&&row.japaneseText!==row.originalText)&&!previewTexts?.has(row.id)).map(row=>row.id):[]);
  useEffect(()=>{
    const ids=JSON.parse(previewIds) as string[];
    if(!token||!ids.length)return;
    let cancelled=false;
    async function loadPreviews(){
      const translations=new Map<string,string|null>();
      for(let i=0;i<ids.length&&!cancelled;i+=8){
        const questionIds=ids.slice(i,i+8);
        try{
          const result=await send<{translations:{id:string;text:string|null}[]}>({action:'consultationPreviews',questionIds,language});
          for(const row of result.translations)translations.set(row.id,row.text);
        }catch{
          for(const id of questionIds)translations.set(id,null);
        }
      }
      if(!cancelled)setPreviews(current=>({scope:previewScope,texts:new Map([...(current?.scope===previewScope?current.texts:[]),...translations])}));
    }
    void loadPreviews();
    return ()=>{cancelled=true;};
  },[language,previewIds,previewScope,send,token]);
  async function downloadSource(id:string,guide?:Manual,page?:number){
    const suffix='?sourcePdf='+id+'&site='+encodeURIComponent(site)+(guide?'&manual='+encodeURIComponent(guide.id)+'&version='+encodeURIComponent(guide.updatedAt):'')+(page?'&page='+page:'');
    const credential=token===GOOGLE_SESSION?await googleSessionToken():token;
    const response=await bridgeFetch(suffix,{headers:{Authorization:'Bearer '+credential}});
    if(!response.ok)throw new Error('document-download-failed');
    const url=URL.createObjectURL(await response.blob());const anchor=document.createElement('a');anchor.href=url;anchor.download=page?'source-p'+page+'.pdf':'source.pdf';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function sourceLink(guide:Manual){const source=guide.sourceDocument;if(!source?.share)return null;
    const pages=[...new Set(source.references.flatMap(ref=>Array.from({length:ref.pageEnd-ref.pageStart+1},(_,i)=>ref.pageStart+i)))].sort((a,b)=>a-b);
    return <div className="actions">{pages.map(page=><button key={page} className="secondary" type="button" disabled={busy} onClick={()=>run(()=>downloadSource(source.id,guide,page))}>
      {{ja:'原本PDF',en:'Source PDF',vi:'PDF nguồn'}[language]} · {page}
    </button>)}</div>;
  }
  function readManual(target:Manual) {
    run(async()=>{await send({action:'viewManual',id:target.id,version:target.updatedAt});await refresh(token);openManual(target.id);});
  }
  const manualEvent=(target:Manual):ManualEvent=>async(event,runId,path,text,eventLanguage)=>{
    const result=await send<{question?:Question}>({action:'manualSession',id:target.id,version:target.updatedAt,event,runId,path,text,language:eventLanguage??language});
    await refresh(token);if(result.question)openCase(result.question.id);return result;
  };
  function selectConsultationStage(stage:ConsultationStage){
    setConsultationStage(stage);
    if(stage==='urgent'){
      setEmergencyContact(undefined);
      run(async()=>setEmergencyContact(await send({action:'emergencyContact'})));
    }
  }
  function searchConsultation(){
    setManualId('');setSearching(true);setResults(undefined);
    run(async()=>{try{
      setResults(await send(consultationStage==='rules'?{action:'search',route:'rules',text:query,language}:
        {action:'adaptiveSearch',route:'work',text:query,language,answers:[],...(photo?{photo:photo.data}:{})}));
    }finally{setSearching(false);}});
  }
  function reportGuide(guide:Manual){return <details className="panel flow"><summary>{{ja:'内容の問題を報告',en:'Report a problem',vi:'Báo cáo vấn đề'}[language]}</summary><div className="actions">{(['outdated','incorrect','unhelpful'] as const).map(reason=><button className="secondary" key={reason} type="button" disabled={busy} onClick={()=>run(async()=>{await send({action:'reportManual',id:guide.id,version:guide.updatedAt,reason});setReported(guide.id);})}>{{ja:{outdated:'情報が古い',incorrect:'内容が違う',unhelpful:'役に立たなかった'},en:{outdated:'Outdated',incorrect:'Incorrect',unhelpful:'Not helpful'},vi:{outdated:'Đã cũ',incorrect:'Không đúng',unhelpful:'Không hữu ích'}}[language][reason]}</button>)}</div>{reported===guide.id&&<p role="status">{{ja:'管理者に報告しました',en:'Report sent',vi:'Đã gửi báo cáo'}[language]}</p>}</details>;}
  function ask(match?: Match) {
    run(async () => {
      const created = await send<Question>({action:match ? 'selfResolve' : 'ask', id:crypto.randomUUID(), text:query, language,
        ...(match ? {matchId:match.id,kind:match.kind} : {route:consultationStage,...(consultationStage==='work'&&photo?{photo:photo.data}:{})})});
      await refresh(token);
      setQuery(''); setResults(undefined);setConsultOpen(false);openCase(created.id);
    });
  }
  function notifyEmergency(){
    run(async()=>{
      const text={ja:'緊急の連絡です。現場の安全確認をお願いします。',en:'Urgent: Please check workplace safety.',vi:'Khẩn cấp: Vui lòng kiểm tra an toàn tại nơi làm việc.'}[language];
      const created=await send<Question>({action:'ask',route:'urgent',id:crypto.randomUUID(),text,language});
      await refresh(token);setConsultOpen(false);openCase(created.id);
    });
  }
  const securityErrors:Record<string,string>={'app-check-unconfigured':'App Checkの設定が不足しています。管理者がFirebaseアプリID・サイトキー・許可アプリIDを確認してください。','app-check-unavailable':'アプリの正当性を確認できませんでした。通信環境を確認して再読み込みしてください。','privacy-review':'機密情報の検出、または機密検査を完了できないため公開を保留しました。本文と検査設定を確認してください。画像の検査に未対応の環境では画像付きマニュアルを公開できません。','save-before-approve':'変更を未確認として保存してから、その版を確認・承認してください。','rate-limited':'利用回数の上限に達しました。少し時間をおいて再度操作してください。','app-check-required':'アプリの正当性を確認できません。App Checkの設定を確認してください。'};
  const errorText = securityErrors[error] ?? (error === 'generation-running' ? '現在マニュアルを生成しています。完了後に操作できます。'
    : error === 'invalid-program' ? '未入力の項目、分岐先、到達不能なブロックや循環を確認してください。'
    : error === 'program-evidence' ? '操作や作業権限の根拠が不足しています。内容を編集し、未確認として保存してから確認してください。'
    : error === 'review-permissions' ? '内容と必要な作業権限を確認してから承認してください。'
    : error === 'answer-required' || error === 'incomplete-answers' ? '追加質問へ回答するか、手動編集して未確認として保存してください。'
    : error === 'use-program-editor' ? '対話型マニュアルの編集画面を使ってください。'
    : error === 'manual-too-large' ? '画像の合計サイズが大きすぎます。図を減らすか、小さな画像を選んでください。'
    : error === 'invalid-figures' ? '図を保存できませんでした。JPEG・PNG・WebPの画像と挿入位置を確認してください。'
    : error === 'review-evidence' ? '原文との照合が完了していません。再生成するか、内容を修正して未確認として保存し、改めて確認してください。'
    : error === 'review-images' ? '編集内容を保存し、図解を再生成してから確認済にしてください。'
    : error === 'google-domain-not-authorized' ? 'この公開URLはFirebaseの承認済みドメインに登録されていません。'
    : error === 'google-popup-blocked' ? 'ブラウザーでログイン用のポップアップを許可してください。'
    : error === 'photo-too-large' ? '800 KB以下の写真を選んでください。'
    : error === 'invalid-invite' ? '招待コードが無効、期限切れ、または使用回数の上限に達しています。'
    : error === 'google-login-failed' ? 'Google ログインを完了できませんでした。再試行してください。'
    : error === 'translation-unavailable' ? t('unavailable')
    : error === 'already-assigned' ? '別の管理者が対応しています。画面を更新してください。'
    : error === 'handoff-incomplete' ? ({ja:'管理者が伝達完了にすると解決できます。',en:'You can mark this resolved after the manager completes the handoff.',vi:'Bạn có thể đánh dấu đã giải quyết sau khi quản lý xác nhận đã thông báo.'})[language]
    : error === 'source-review-required' ? '保護済みの会話を確認してからマニュアルを作成してください。'
    : error === 'ai-not-configured' ? 'Gemini の設定が必要です。'
    : error === 'source-missing' ? '参照元の会話がありません。文章を編集して図解を再生成できます。'
    : error === 'conversation-updated' ? t('conversationUpdated') : error === 'voice-error' ? t('voiceError') : error === 'review-steps' ? '確認が必要な手順を編集してから公開してください。'
    : error === 'stale-manual' ? '別の操作で更新されました。画面を更新してから編集してください。'
    : error === 'login-required' ? 'セッションの有効期限が切れました。ログアウトして再ログインしてください。' : t('error'));

  if (!data) return <main className="login-shell"><section className="login panel flow">
    <Brand/><div className="eyebrow">MULTILINGUAL WORKPLACE SUPPORT</div><h1>Bridge Work 2.0</h1>
    <p>言葉の壁を越えて、仕事をもっとスムーズに。</p>
    {error && <p role="alert" className="alert">{errorText}</p>}
    {demo === undefined && !error && <p className="muted" role="status">読み込み中<PendingDots/></p>}
    {demo!==undefined&&<OrganizationEntry config={googleAuth} demo={demo} language={language} busy={busy} run={run} enter={enter} submit={(auth,payload)=>request(auth,payload,'?onboard')}/>}
    {demo === true && <details className="alternate-login"><summary>デモアカウントを直接開く</summary>
      <button disabled={busy} onClick={() => run(() => enter('linh'))}>Linh Nguyễn · Nhân viên / スタッフ <span>→</span></button>
      <button className="secondary" disabled={busy} onClick={() => run(() => enter('sato'))}>佐藤 美咲 · 管理者 <span>→</span></button>
      <button className="secondary" disabled={busy} onClick={() => run(() => enter('alex'))}>Alex Smith · Staff <span>→</span></button><details><summary>引き継ぎデモ</summary><button className="secondary" disabled={busy} onClick={()=>run(()=>enter('tanaka'))}>田中 健太 · 管理者</button></details></details>}
    {demo === false && !googleAuth && <details className="alternate-login"><summary>既存のメールアカウント</summary><form className="flow" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      run(async () => {const result = await request<{token:string}>('',{email:form.get('email'),password:form.get('password')},'?login'); await enter(result.token);});
    }}><label>メールアドレス<input name="email" type="email" required autoComplete="username"/></label>
      <label>パスワード<input name="password" type="password" required autoComplete="current-password"/></label><button disabled={busy}>ログイン</button></form></details>}
  </section></main>;

  function caseList(items: Question[]) {
    const labels={ja:{loading:'タイトルを翻訳中',failed:'タイトルを翻訳できませんでした'},en:{loading:'Translating title',failed:'Title translation unavailable'},vi:{loading:'Đang dịch tiêu đề',failed:'Không dịch được tiêu đề'}}[language];
    return items.length ? <div className="rows">{items.map(row=>{
      const title=row.originalLanguage===language?row.originalText:previewTexts?.get(row.id)||(language==='ja'&&row.japaneseText!==row.originalText?row.japaneseText:'');
      const failed=!title&&previewTexts?.has(row.id);
      return <button className={'row ' + (selected === row.id ? 'selected' : '')} key={row.id} onClick={() => openCase(row.id)}>
      <span className="tile" aria-hidden="true">◫</span><span className="row-text"><strong>{title||(failed?labels.failed:<>{labels.loading}<PendingDots/></>)}</strong>{failed&&<small lang={row.originalLanguage}>{row.originalText}</small>}<small>{siteName(row.siteId)} · {new Date(row.createdAt).toLocaleDateString(language)}</small></span>
      <span className="case-badges">
        {row.route==='urgent'&&<span className="badge urgent-badge">{{ja:'緊急',en:'Urgent',vi:'Khẩn cấp'}[language]}</span>}
        {manager&&row.status==='resolved'&&pendingHistory.has(row.id)&&<span className="badge active">履歴承認待ち</span>}
        <Badge variant={row.status}>{t(row.status)}</Badge>
      </span><span aria-hidden="true">›</span>
    </button>;})}</div> : <p className="empty">{t('empty')}</p>;
  }

  return <WorkspaceShell profile={data.profile} language={language} tab={tab} unread={unread} demo={data.demo} busy={busy||listening} onNavigate={next=>{if(next==='manuals')setManualId('');changeTab(next);}} onSignOut={signOut}>
        {data.aiFixtures&&<p className="notice" role="status">{{ja:'架空のデモ · AIは模擬応答です',en:'Fictional demo · Simulated AI responses',vi:'Dữ liệu mẫu · Phản hồi AI mô phỏng'}[language]}</p>}
        {tab==='settings'&&<Settings profile={data.profile} language={language} site={site} busy={busy||listening} onLanguage={changeLanguage} onSite={changeSite}/>}
        {tab==='settings'&&!data.demo&&<form className="panel flow" onSubmit={event=>{event.preventDefault();const name=String(new FormData(event.currentTarget).get('displayName')??'');run(async()=>{await request(token,{action:'profileName',name});await refresh(token);});}}><label>{{ja:'表示名',en:'Display name',vi:'Tên hiển thị'}[language]}<input key={data.profile.name} name="displayName" defaultValue={data.profile.name} required maxLength={100}/></label><button disabled={busy}>{{ja:'表示名を保存',en:'Save display name',vi:'Lưu tên hiển thị'}[language]}</button></form>}
        {tab==='members'&&manager&&<section className="panel flow"><h2>メンバー・招待</h2><ul className="member-list">{data.managers?.filter(person=>person.siteIds.includes(site)).map(person=><li key={person.id}><strong>{person.name}</strong><small>{t('manager')}</small></li>)}{data.staff.filter(person=>person.siteIds.includes(site)).map(person=><li key={person.id}><strong>{person.name}</strong><small>{t('employee')}</small></li>)}</ul>{data.demo?<p className="notice">試用モードの招待コードは <code>123456</code> です。</p>:<form className="flow" onSubmit={event=>{event.preventDefault();const values=new FormData(event.currentTarget);run(async()=>setInvite(await request(token,{siteId:site,uses:Number(values.get('uses'))},'?invite')));}}><p>有効時間は発行から24時間です。</p><label>コード使用上限<input name="uses" type="number" min="1" max="50" defaultValue="5" required/></label><button disabled={busy}>招待コードを発行</button></form>}{invite&&<p className="notice"><code>{invite.code}</code><br/>有効期限: {new Date(invite.expiresAt).toLocaleString(language)}</p>}</section>}
        {error && <p className="alert" role="alert">{errorText}</p>}
        {busy && !searching && <p className="busy" role="status">{t('searching').replace(/…$/,'')}<PendingDots/></p>}
        {tab === 'home' && !manager && <>
          {!consultOpen&&<section className="panel flow staff-hero"><p className="eyebrow">{data.profile.companyName||siteName(site)}</p><h2>{t('hero')}</h2><button onClick={()=>{setConsultOpen(true);setConsultationStage('urgency');setQuery('');setPhoto(undefined);setResults(undefined);setManualId('');}}>{{ja:'困りごとを相談',en:'Get help at work',vi:'Hỏi về khó khăn trong công việc'}[language]}</button></section>}
          {consultOpen&&<div className="screen-title"><button type="button" className="screen-back" disabled={busy} aria-label={{ja:'戻る',en:'Back',vi:'Quay lại'}[language]} onClick={()=>{
            if(manual)setManualId('');else if(results)setResults(undefined);
            else if(consultationStage==='urgency')setConsultOpen(false);
            else setConsultationStage(consultationStage==='urgent'||consultationStage==='category'?'urgency':'category');
          }}>‹</button><h2>{({ja:'困りごとを相談',en:'Get help at work',vi:'Hỏi về công việc'})[language]}</h2></div>}
          {consultOpen&&<ConsultationRouting stage={consultationStage} language={language} contact={emergencyContact} onSelect={selectConsultationStage}/>}
          {consultOpen&&consultationStage==='urgent'&&<button type="button" className="secondary" disabled={busy} onClick={notifyEmergency}>{{ja:'管理者へ緊急の連絡を送る',en:'Send an urgent alert to managers',vi:'Gửi thông báo khẩn cho quản lý'}[language]}</button>}
          {consultOpen&&(consultationStage==='rules'||consultationStage==='work')&&<>
          {consultationStage==='work'&&photoEnabled&&!manual&&<details className="panel photo-intake"><summary>{{ja:'写真を追加（任意）',en:'Add a photo (optional)',vi:'Thêm ảnh (không bắt buộc)'}[language]}</summary><p>{{ja:'個人情報が写っていない写真を選んでください。検索時に画像をAIで解析します。',en:'Choose a photo without personal information. AI analyzes it during the search.',vi:'Chọn ảnh không có thông tin cá nhân. AI sẽ phân tích ảnh khi tìm kiếm.'}[language]}</p><input type="file" aria-label="相談の写真" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(!file){setPhoto(undefined);return;}run(async()=>{setPhoto(undefined);if(file.size>800_000)throw new Error('photo-too-large');const data=new Uint8Array(await file.arrayBuffer());let raw='';for(let i=0;i<data.length;i+=8192)raw+=String.fromCharCode(...data.subarray(i,i+8192));setPhoto({name:file.name,data:btoa(raw)});});}}/>{photo&&<div className="actions"><small>{photo.name}</small>{results&&<button type="button" className="secondary" disabled={busy} onClick={()=>searchConsultation()}>写真を含めて探す</button>}<button type="button" className="link" disabled={busy} onClick={()=>setPhoto(undefined)}>写真を外す</button></div>}{results?.photoAnalyzed===false&&<p className="notice">写真を解析できなかったため、文章で確認しました。</p>}</details>}
          {consultOpen&&searching&&<section className="panel flow search-progress" role="status"><div className="wave" aria-hidden="true">▂▅▃▇▅▂▃</div><strong>{t('searching').replace(/…$/,'')}<PendingDots/></strong><p>{query}</p></section>}
          {results?.adaptive?.mode==='safety'&&<AdaptiveIntake details={results.adaptive} language={language} busy={busy} round={1} onAnswer={()=>undefined}/>}
          {results&&!results.matches.length&&results.adaptive?.mode!=='safety'&&<p className="notice">{{ja:'該当する情報がありません。管理者に相談できます。',en:'No matching guidance. You can ask a manager.',vi:'Không tìm thấy thông tin phù hợp. Bạn có thể hỏi quản lý.'}[language]}</p>}
          {results && results.matches.length > 0 && <section className={'panel flow '+(manual?'opened-guide':'')} aria-label={t('similar')}>
            {!manual&&<><h2 id="related-knowledge" tabIndex={-1} ref={focusSearchResults}>{consultationStage==='rules'?{ja:'関連するFAQ',en:'Related FAQs',vi:'Câu hỏi thường gặp liên quan'}[language]:{ja:'関連するマニュアル',en:'Related guides',vi:'Hướng dẫn liên quan'}[language]}</h2>
            <p className="notice">{t('confirmSite')}</p>{!results.ai && <p className="muted">{t('fallback')}</p>}</>}
            {results.matches.filter(match=>!manual||match.id===manual.id).map(match => <article className="result flow" key={match.kind + match.id}>
              {!manual&&<><div className="eyebrow">{siteName(match.siteId)} · {t(match.kind === 'manual' ? 'manuals' : 'cases')}</div><h3>{match.title}</h3></>}
              {manual?.id === match.id && manual.kind==='faq' ? <section className="flow">
                <h3>{(manual.translations[language]??manual.content).title}</h3>
                {(manual.translations[language]??manual.content).steps.map((step,index)=><p key={index}>{step}</p>)}
                {(manual.translations[language]??manual.content).cautions.map((note,index)=><p key={index} className="notice">{note}</p>)}
                <div className="actions"><button disabled={busy} onClick={()=>ask(match)}>{t('resolve')}</button><button className="secondary" disabled={busy} onClick={()=>ask()}>{{ja:'解決しない',en:'Not resolved',vi:'Chưa giải quyết'}[language]}</button></div>
              </section> : manual?.id === match.id ? <>
                <ManualView manual={manual} language={language} onEvent={manualEvent(manual)} contextText={query}/>
                {sourceLink(manual)}{reportGuide(manual)}
                {!manual.program&&<button className="secondary" disabled={busy} onClick={() => ask(match)}>{t('selfResolve')}</button>}
              </> : <><p>{consultationStage==='rules'?{ja:'質問と回答を確認できます。',en:'Open the question and answer.',vi:'Xem câu hỏi và câu trả lời.'}[language]:t('manualFits')}</p><div className="actions">
                <button className="guide-open" disabled={busy} onClick={() => run(async () => {
                  await send({action:'viewManual',id:match.id,version:match.version});
                  await refresh(token);
                  setManualId(match.id);
                })}>{consultationStage==='rules'?{ja:'FAQを見る',en:'Open FAQ',vi:'Xem câu hỏi thường gặp'}[language]:t('showManual')}</button>
                <button className="link" disabled={busy} onClick={() => setResults({...results,
                  matches: results.matches.filter(candidate => candidate.id !== match.id)})}>{t('skipManual')}</button>
              </div></>}
            </article>)}
          </section>}
          {consultOpen&&!results&&!searching&&<form className="panel flow ask" onSubmit={event => {event.preventDefault();searchConsultation();}}>
            <div className="section-head"><span className="tile">?</span><div><div className="eyebrow">{t('help')}</div><h2>{t('hero')}</h2></div></div>
            <textarea id="new-consultation" aria-label={t('help')} placeholder={t('placeholder')} rows={3} maxLength={3000} required value={query} disabled={busy}
              onChange={event => {setQuery(event.target.value);setResults(undefined);setManualId('');}}/>
            <div className="actions"><button disabled={busy || listening || !query.trim()}>⌕ &nbsp; {t('search')}</button>
              {voiceSupported && <button className="secondary" type="button" disabled={busy || listening} onClick={()=>dictate()}>{t(listening ? 'listening' : 'voice')}</button>}
              <button className="secondary" type="button" disabled={busy||listening||!query.trim()} onClick={() => ask()}>{t('send')} →</button></div>
          </form>}
          {consultOpen&&(results||searching)&&<button className="secondary direct-contact" type="button" disabled={busy||!query.trim()} onClick={()=>ask()}>{t('send')} →</button>}
          </>}
        </>}
        {tab === 'cases' && <>
          <section className={'panel flow '+(question?'case-list-with-detail':'')}>
            <div className="split">
              <h2>{manager?({ja:'相談',en:'Consultations',vi:'Trao đổi'}[language]):t('cases')}</h2>
              <button className="secondary" disabled={busy} onClick={() => run(async () => {
                await refresh(token);
                setPreviews(current=>current?.scope===previewScope?{...current,texts:new Map([...current.texts].filter(([,text])=>text!==null))}:current);
              })}>{t('refresh')}</button>
            </div>
            {manager&&<div className="stats" role="group" aria-label="対応状況">
              {(['new','active','resolved'] as const).map(status=><button type="button" className="panel stat" key={status} data-status={status}
                aria-pressed={statusFilter===status} onClick={()=>{setStatusFilter(status);setSelected('');}}>
                <Badge variant={status}>{t(status)}</Badge><strong>{questions.filter(row=>row.status===status).length}</strong>
              </button>)}
            </div>}
            {manager&&statusFilter==='resolved'&&<div className="actions"><button type="button" aria-pressed={historyOnly} className={historyOnly?'':'secondary'}
              onClick={()=>{setHistoryOnly(current=>!current);setSelected('');}}>履歴承認待ち · {visibleQuestions.filter(row=>pendingHistory.has(row.id)).length}</button></div>}
            {caseList(manager&&statusFilter==='resolved'&&historyOnly?visibleQuestions.filter(row=>pendingHistory.has(row.id)):visibleQuestions)}
          </section>
          {question && <section className="panel flow chat-screen">
            <header className="chat-header"><button className="screen-back" type="button" onClick={()=>setSelected('')} aria-label={{ja:'戻る',en:'Back',vi:'Quay lại'}[language]}>‹</button><span className="chat-avatar" aria-hidden="true">{chatPeer?.slice(0,1)||'•'}</span><div className="chat-peer"><strong>{chatPeer||t(manager?'employee':'manager')}</strong><small>{t(manager?'employee':'manager')}</small></div><Badge variant={question.status}>{t(question.status)}</Badge></header>
            {manager&&question.status!=='resolved'&&(!question.assigneeId?<button className="secondary" disabled={busy} onClick={()=>run(async()=>{await send({action:'assign',id:question.id});await refresh(token);})}>対応する</button>:question.assigneeId===data.profile.id&&<details><summary>担当者を変更</summary><select aria-label="引き継ぎ先" value="" disabled={busy} onChange={event=>{const managerId=event.target.value;if(managerId)run(async()=>{await send({action:'assign',id:question.id,managerId});await refresh(token);});}}><option value="">引き継ぎ先を選択</option>{data.managers?.filter(person=>person.id!==data.profile.id&&person.siteIds.includes(site)).map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></details>)}
            {question.references.map(reference => <div className="notice" key={reference.kind + reference.id}>{reference.title} · {reference.answer}</div>)}
            <ChatMessages key={question.id+':'+language} question={question} viewerId={data.profile.id} language={language}
              requestTranslations={requestChatTranslations}/>
            {question.status !== 'resolved' ? <>
              {(!manager||!question.assigneeId||question.assigneeId===data.profile.id)&&<form className="chat-composer" onSubmit={event => {event.preventDefault(); if(busy||listening||!message.trim())return; run(async () => {
                await send({action:'reply', id:question.id, text:message, messageId:crypto.randomUUID(),language}); setMessage('');await refresh(token);
              });}}><textarea aria-label={t('message')} placeholder={t('message')} value={message} rows={2} enterKeyHint="enter"
                onChange={event=>setMessage(event.target.value)} maxLength={3000} required
                onKeyDown={event=>{
                  if(event.key!=='Enter'||event.shiftKey||event.nativeEvent.isComposing||event.keyCode===229||window.matchMedia('(pointer: coarse)').matches)return;
                  event.preventDefault();
                  if(!event.repeat&&!busy&&!listening&&message.trim())event.currentTarget.form?.requestSubmit();
                }}/>
                {voiceSupported&&<button type="button" className="secondary" disabled={busy||listening} onClick={()=>dictate('reply')}>{listening?t('listening'):t('voice')}</button>}
                <button className="chat-send" aria-label={t('reply')} disabled={busy||listening||!message.trim()}>↑</button></form>}
              {manager&&(!question.assigneeId||question.assigneeId===data.profile.id)&&<div className="actions chat-resolve">
                <button type="button" className="secondary" disabled={busy||listening||Boolean(message.trim())||Boolean(question.handoffCompleted)}
                  onClick={()=>run(async()=>{await send({action:'completeHandoff',id:question.id});await refresh(token);})}>
                  {question.handoffCompleted&&'✓ '}{({ja:'伝達完了',en:'Mark handoff complete',vi:'Đánh dấu đã thông báo'})[language]}
                </button>
              </div>}
              {!manager && <div className="actions chat-resolve">
                {!question.handoffCompleted&&<small className="muted">{{ja:'管理者の伝達完了を待っています。',en:'Waiting for the manager to complete the handoff.',vi:'Đang chờ quản lý xác nhận đã thông báo.'}[language]}</small>}
                <button type="button" className="resolve-cta" disabled={busy||listening||!question.handoffCompleted||Boolean(message.trim())} onClick={() => run(async () => {
                const resolved = await send<Question>({action:'resolve', id:question.id});
                setData(current => current && {...current, questions: current.questions.map(row =>
                  row.id === resolved.id && row.siteId === resolved.siteId ? resolved : row)});
              })}>{t('resolve')}</button></div>}
            </> : <>{question.resolution && <p className="notice">{t('resolution')} · {question.resolution}</p>}
              {manager && <div className="flow">
                {manuals.filter(item=>item.sourceQuestionIds.includes(question.id)).map(item=><button className="secondary" key={item.id} onClick={()=>{setFaqOnly(item.kind==='faq');openManual(item.id);}}>{item.kind==='faq'?'FAQの確認へ':item.status==='published'?'公開済みマニュアルを見る':'マニュアルの確認へ'}</button>)}
                {!question.route&&!question.approvedForReuse && <label className="check"><input type="checkbox" checked={reuseConfirmed} onChange={event => setReuseConfirmed(event.target.checked)}/>
                  質問・回答・解決方法に共有できない情報が含まれていないことを確認しました</label>}
                {!question.route&&<div className="actions"><button className="secondary" disabled={busy || (!question.approvedForReuse && !reuseConfirmed)} onClick={() => run(async () => {
                  await send({action:'reuse',id:question.id,approved:!question.approvedForReuse});setReuseConfirmed(false);await refresh(token);
                })}>{question.approvedForReuse ? '再利用承認を取り消す' : 'ナレッジ再利用を承認'}</button>
</div>}
              </div>}
            </>}
          </section>}
        </>}
        {tab === 'manuals' && <>
          {manager ? <>
            {!reviewManual&&<section className="panel flow manual-list-screen">
              <span className="eyebrow">ステップ 1 / 2</span>
              <h2>{faqOnly?'FAQの管理':'マニュアルの管理'}</h2>
              <div className="actions" role="group" aria-label="ナレッジの種類">
                <button type="button" className={faqOnly?'secondary':''} aria-pressed={!faqOnly} onClick={()=>{setFaqOnly(false);setManualId('');}}>業務マニュアル</button>
                <button type="button" className={faqOnly?'':'secondary'} aria-pressed={faqOnly} onClick={()=>{setFaqOnly(true);setManualId('');}}>ルール・制度 FAQ</button>
              </div>
              <div className="manual-status-tabs" role="tablist" aria-label="確認状態">
                {(['draft','published'] as const).map(status=><button role="tab" key={status} aria-selected={manualStatus===status}
                  onClick={()=>{setManualStatus(status);setManualId('');}}>
                  {status==='draft' ? '未確認' : '確認済'}<span>{manuals.filter(row=>row.status===status&&(row.kind==='faq')===faqOnly).length}</span>
                </button>)}
              </div>
              {reviewItems.length>0 ? <label className="manual-picker">{faqOnly?'FAQを選択':'マニュアルを選択'}
                <select value="" onChange={event=>{setError('');setManualId(event.target.value);}}>
                  <option value="" disabled>一覧から選択してください</option>
                  {reviewItems.map(row=>{
                    const source=questions.find(question=>row.sourceQuestionIds.includes(question.id));
                    const title=hasManualContent(row)?row.content.title:(source?.japaneseText||source?.originalText||'相談からの下書き').replace(/\s+/g,' ').slice(0,80);
                    return <option value={row.id} key={row.id}>{title}（{row.status==='published'?'公開済':isGenerating(row)?'生成中':row.reviewState==='awaiting_answers'?'追加質問待ち':row.generation?.error==='source-review-required'?'生成前の確認待ち':row.reviewState==='archived'?'アーカイブ済み':row.reviewState==='held'?'保留':'承認待ち'}）</option>;
                  })}
                </select>
              </label> : <p className="empty">{t('empty')}</p>}
              {!faqOnly&&<details className="manual-library-disclosure"><summary>企業マニュアル・PDFの取り込み</summary><DocumentLibrary key={site} site={site} demo={data.demo} busy={busy} send={send} download={downloadSource} openManual={async guide=>{await refresh(token);setManualStatus('draft');setManualId(guide.id);}}/></details>}
            </section>}
            {reviewManual&&<div className="screen-title manual-detail-navigation"><button type="button" className="secondary" disabled={busy} onClick={()=>{setManualId('');setError('');}}>‹ 一覧に戻る</button><span className="eyebrow">ステップ 2 / 2</span></div>}
            {reviewManual?.status==='published' && <ManualSend key={reviewManual.id+reviewManual.updatedAt} manual={reviewManual} staff={data.staff} deliveries={deliveries} busy={busy}
              onSend={async employeeIds=>{await send({action:'sendManual',id:reviewManual.id,version:reviewManual.updatedAt,employeeIds});await refresh(token);}}/>}
            {reviewManual && <ManualReview key={reviewManual.id} manual={reviewManual} questions={questions} busy={busy} ai={data.ai}
              privacyOverride={error==='privacy-review'?()=>run(async()=>{
                const publish={id:reviewManual.id,version:reviewManual.updatedAt,publish:true,overridePrivacy:true};
                await send(reviewManual.program?{...publish,action:'saveProgram',program:reviewManual.program,confirmPermissions:true}:{...publish,action:'saveManual',content:reviewManual.content});
                setManualStatus('published');await refresh(token);
              }):undefined}
              staff={data.staff} saveAccess={access=>run(async()=>{await send({action:'manualAccess',id:reviewManual.id,version:reviewManual.updatedAt,access});setManualStatus('draft');setManualId(reviewManual.id);await refresh(token);})}
              sourceAction={action=>run(async()=>{await send({...action,id:reviewManual.id,version:reviewManual.updatedAt});await refresh(token);})}
              stats={data.manualStats?.[reviewManual.id]}
              answer={answers=>run(async()=>{await send({action:'answerManual',id:reviewManual.id,version:reviewManual.updatedAt,answers});await refresh(token);})}
              changeState={mode=>run(async()=>{await send({action:'manualState',id:reviewManual.id,version:reviewManual.updatedAt,mode});setManualStatus('draft');setManualId(reviewManual.id);await refresh(token);})}
              saveProgram={(program,publish,confirmPermissions,applicability)=>run(async()=>{await send({action:'saveProgram',id:reviewManual.id,version:reviewManual.updatedAt,program,publish,confirmPermissions,...(applicability?{applicability}:{})});setManualStatus(publish?'published':'draft');setManualId(reviewManual.id);await refresh(token);})}
              regenerate={imagesOnly => run(async () => {
                await send({action:'regenerateManual',id:reviewManual.id,version:reviewManual.updatedAt,imagesOnly});
                setManualStatus('draft');setManualId(reviewManual.id);await refresh(token);
              })}
              save={(content,publish,edits) => run(async () => {
                await send({action:'saveManual',id:reviewManual.id,version:reviewManual.updatedAt,content,publish,...edits});
                setManualStatus(publish ? 'published' : 'draft');setManualId(reviewManual.id);await refresh(token);
              })}/>}
          </> : manual?<div className="flow" key={manual.id}>
            <div className="screen-title"><button type="button" className="secondary" onClick={()=>{setManualId('');setError('');}}>
              ‹ {{ja:'届いたマニュアルに戻る',en:'Back to received guides',vi:'Quay lại tài liệu đã nhận'}[language]}
            </button></div>
            <ManualView manual={manual} language={language} onEvent={manualEvent(manual)}/>{sourceLink(manual)}{reportGuide(manual)}
          </div>:<ManualInbox deliveries={deliveries} manuals={manuals} language={language} busy={busy} onOpen={readManual}/>}
        </>}
        <footer>Bridge Work <span>·</span> {siteName(site)}</footer>
  </WorkspaceShell>;
}
