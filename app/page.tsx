'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { copy } from '../lib/copy';
import { ManualReview, ManualView, isGenerating } from './manual';
import {ManualInbox,ManualSend} from './manual-delivery';
import {OrganizationEntry,type GoogleConfig} from './organization-entry';
import {Settings,WorkspaceShell,type AppTab} from './workspace-shell';
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

function Brand() {
  return <div className="brand"><span className="brand-icon" aria-hidden="true">↔</span><div>Bridge<span>Work</span><small>WORKPLACE SUPPORT</small></div></div>;
}
function Badge({children, variant = ''}: {children: ReactNode; variant?: string}) {
  return <span className={'badge ' + variant}>{children}</span>;
}
export default function BridgeWork() {
  const [token,setToken] = useState('');
  const [data,setData] = useState<Workspace>();
  const [googleAuth,setGoogleAuth]=useState<GoogleConfig>();
  const [invite,setInvite]=useState<{code:string;expiresAt:string}>();
  const [chatTranslations,setChatTranslations]=useState<Record<string,string>>({});
  const [manualFilter,setManualFilter]=useState('');
  const [demo,setDemo] = useState<boolean>();
  const [language,setLanguage] = useState<Language>('ja');
  const [tab,setTab] = useState<AppTab>('home');
  const [site,setSite] = useState('');
  const [selected,setSelected] = useState('');
  const [manualId,setManualId] = useState('');
  const [manualStatus,setManualStatus] = useState<Manual['status']>('draft');
  const [query,setQuery] = useState('');
  const [results,setResults] = useState<{matches: Match[]; ai: boolean}>();
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [reuseConfirmed,setReuseConfirmed] = useState(false);
  const [statusFilter,setStatusFilter] = useState('all');
  const [voiceSupported,setVoiceSupported] = useState(false);
  const [listening,setListening] = useState(false);
  const t = (key: Parameters<typeof copy>[1]) => copy(language,key);

  const request = useCallback(async <T,>(auth: string, payload?: object, suffix = ''): Promise<T> => {
    const response = await bridgeFetch(suffix, {
      cache: 'no-store', method: payload ? 'POST' : 'GET',
      headers: {Authorization: 'Bearer ' + auth, ...(payload ? {'Content-Type':'application/json'} : {})},
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
  const enter = useCallback(async (auth: string) => {
    const next = await refresh(auth);
    const cached = localStorage.getItem('bridge-language-' + next.profile.id);
    setLanguage(languages.find(code => code === cached) ?? next.profile.preferredLanguage);
    setSite(next.profile.siteIds[0]);
    sessionStorage.setItem('bridge-token',auth);
    setToken(auth);
  }, [refresh]);
  useEffect(() => {
    request<{demo:boolean;googleAuth?:GoogleConfig}>('',undefined,'?config').then(value => {setDemo(value.demo);setGoogleAuth(value.googleAuth);}).catch(() => setError('app-check-unavailable'));
    const saved = sessionStorage.getItem('bridge-token');
    if (saved) enter(saved).catch(() => sessionStorage.removeItem('bridge-token'));
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
  function changeTab(next: AppTab) {setTab(next); setError('');}
  function changeLanguage(next:Language) {
    if(!data)return;setLanguage(next);setResults(undefined);localStorage.setItem('bridge-language-'+data.profile.id,next);
    request(token,{action:'language',language:next}).catch(()=>setError('server-error'));
  }
  function changeSite(next:string){setSite(next);setSelected('');setManualId('');setResults(undefined);}
  function signOut(){
    setInvite(undefined);setManualFilter('');setChatTranslations({});
    if(googleAuth)void import('firebase/app').then(async sdk=>{const app=sdk.getApps().find(item=>item.name==='bridge-work-login');if(app){const auth=await import('firebase/auth');await auth.signOut(auth.getAuth(app));}}).catch(()=>undefined);
    sessionStorage.removeItem('bridge-token');setToken('');setData(undefined);setLanguage('ja');setQuery('');setResults(undefined);setSelected('');
    setManualId('');setMessage('');setReuseConfirmed(false);setError('');setTab('home');setStatusFilter('all');
  }
  function openCase(id: string) {
    setSelected(id); setMessage(''); setReuseConfirmed(false); changeTab('cases');
  }
  function openManual(id: string) {
    setManualId(id);
    const next = data?.manuals.find(manual=>manual.id===id);
    if (next) setManualStatus(next.status);
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
  const questions = data?.questions.filter(row => row.siteId === site) ?? [];
  const manuals = data?.manuals.filter(row => row.siteId === site) ?? [];
  const question = questions.find(row => row.id === selected);
  const manual = manuals.find(row => row.id === manualId);
  const reviewManual = manual?.status === manualStatus ? manual : manuals.find(row=>row.status===manualStatus);
  const deliveries=data?.deliveries.filter(row=>row.siteId===site) ?? [];
  const unread=manager?0:deliveries.filter(row=>!row.readAt).length;
  const send = <T,>(payload: object) => request<T>(token, {siteId:site,...payload});
  function readManual(target:Manual) {
    run(async()=>{await send({action:'viewManual',id:target.id,version:target.updatedAt});await refresh(token);openManual(target.id);});
  }
  const manualEvent=(target:Manual):ManualEvent=>async(event,runId,path,text,eventLanguage)=>{
    const result=await send<{question?:Question}>({action:'manualSession',id:target.id,version:target.updatedAt,event,runId,path,text,language:eventLanguage??language});
    await refresh(token);if(result.question)openCase(result.question.id);return result;
  };
  function ask(match?: Match) {
    run(async () => {
      const created = await send<Question>({action:match ? 'selfResolve' : 'ask', id:crypto.randomUUID(), text:query, language,
        ...(match ? {matchId:match.id,kind:match.kind} : {})});
      await refresh(token);
      setQuery(''); setResults(undefined); openCase(created.id);
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
    : error === 'invalid-invite' ? '招待コードが無効、期限切れ、または使用回数の上限に達しています。'
    : error === 'google-login-failed' ? 'Google ログインを完了できませんでした。再試行してください。'
    : error === 'translation-unavailable' ? t('unavailable')
    : error === 'already-assigned' ? '別の管理者が対応しています。画面を更新してください。'
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
    {demo === undefined && !error && <p className="muted">読み込み中…</p>}
    {demo === true && <><Badge variant="demo">{t('demo')}</Badge>
      <button disabled={busy} onClick={() => run(() => enter('linh'))}>Linh Nguyễn · Nhân viên / スタッフ <span>→</span></button>
      <button className="secondary" disabled={busy} onClick={() => run(() => enter('sato'))}>佐藤 美咲 · 管理者 <span>→</span></button>
      <button className="secondary" disabled={busy} onClick={() => run(() => enter('alex'))}>Alex Smith · Staff <span>→</span></button><details><summary>引き継ぎデモ</summary><button className="secondary" disabled={busy} onClick={()=>run(()=>enter('tanaka'))}>田中 健太 · 管理者</button></details></>}
    {demo===false&&googleAuth&&<OrganizationEntry config={googleAuth} language={language} busy={busy} run={run} enter={enter} submit={(auth,payload)=>request(auth,payload,'?onboard')}/>}
    {demo === false && <form className="flow" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      run(async () => {const result = await request<{token:string}>('',{email:form.get('email'),password:form.get('password')},'?login'); await enter(result.token);});
    }}><label>メールアドレス<input name="email" type="email" required autoComplete="username"/></label>
      <label>パスワード<input name="password" type="password" required autoComplete="current-password"/></label><button disabled={busy}>ログイン</button></form>}
  </section></main>;

  function caseList(items: Question[]) {
    return items.length ? <div className="rows">{items.map(row => <button className={'row ' + (selected === row.id ? 'selected' : '')} key={row.id} onClick={() => openCase(row.id)}>
      <span className="tile" aria-hidden="true">◫</span><span className="row-text"><strong>{manager ? row.japaneseText || row.originalText : row.originalText}</strong><small>{siteName(row.siteId)} · {new Date(row.createdAt).toLocaleDateString(language)}</small></span>
      <Badge variant={row.status}>{t(row.status)}</Badge><span aria-hidden="true">›</span>
    </button>)}</div> : <p className="empty">{t('empty')}</p>;
  }

  return <WorkspaceShell profile={data.profile} language={language} tab={tab} unread={unread} demo={data.demo} busy={busy||listening} onNavigate={changeTab} onSignOut={signOut}>
        {data.aiFixtures&&<p className="notice" role="status">{{ja:'架空のデモ · AIは模擬応答です',en:'Fictional demo · Simulated AI responses',vi:'Dữ liệu mẫu · Phản hồi AI mô phỏng'}[language]}</p>}
        {tab==='settings'&&<Settings profile={data.profile} language={language} site={site} busy={busy||listening} onLanguage={changeLanguage} onSite={changeSite}/>}
        {tab==='settings'&&!data.demo&&<form className="panel flow" onSubmit={event=>{event.preventDefault();const name=String(new FormData(event.currentTarget).get('displayName')??'');run(async()=>{await request(token,{action:'profileName',name});await refresh(token);});}}><label>{{ja:'表示名',en:'Display name',vi:'Tên hiển thị'}[language]}<input key={data.profile.name} name="displayName" defaultValue={data.profile.name} required maxLength={100}/></label><button disabled={busy}>{{ja:'表示名を保存',en:'Save display name',vi:'Lưu tên hiển thị'}[language]}</button></form>}
        {tab==='settings'&&manager&&!data.demo&&<section className="panel flow"><h2>メンバー・招待</h2><ul>{data.staff.map(person=><li key={person.id}>{person.name}</li>)}</ul><form className="flow" onSubmit={event=>{event.preventDefault();const values=new FormData(event.currentTarget);run(async()=>setInvite(await request(token,{siteId:site,hours:Number(values.get('hours')),uses:Number(values.get('uses'))},'?invite')));}}><label>有効時間<input name="hours" type="number" min="1" max="168" defaultValue="24" required/></label><label>使用上限<input name="uses" type="number" min="1" max="50" defaultValue="5" required/></label><button disabled={busy}>招待コードを発行</button></form>{invite&&<p className="notice"><code>{invite.code}</code><br/>有効期限: {new Date(invite.expiresAt).toLocaleString(language)}</p>}</section>}
        {error && <p className="alert" role="alert">{errorText}</p>}
        {busy && <p className="busy" role="status">{t('searching')}</p>}
        {tab === 'home' && !manager && <>
          {!results&&<section className="panel flow staff-hero"><p className="eyebrow">{data.profile.companyName||siteName(site)}</p><h2>{t('hero')}</h2><button onClick={()=>{const field=document.getElementById('new-consultation');field?.scrollIntoView({block:'center'});field?.focus();}}>{{ja:'新しく相談する',en:'Start a consultation',vi:'Bắt đầu hỏi đáp'}[language]}</button></section>}
          <ManualInbox deliveries={deliveries} manuals={manuals} language={language} busy={busy} onOpen={readManual}/>
          {results && results.matches.length > 0 && <section className="panel flow" aria-labelledby="related-knowledge">
            <h2 id="related-knowledge" tabIndex={-1} ref={focusSearchResults}>{t('similar')}</h2>
            <p className="notice">{t('confirmSite')}</p>{!results.ai && <p className="muted">{t('fallback')}</p>}
            {results.matches.map(match => <article className="result flow" key={match.kind + match.id}>
              <div className="eyebrow">{siteName(match.siteId)} · {t(match.kind === 'manual' ? 'manuals' : 'cases')}</div>
              <h3>{match.title}</h3>
              {manual?.id === match.id ? <>
                <ManualView manual={manual} language={language} onEvent={manualEvent(manual)} contextText={query}/>
                {!manual.program&&<button className="secondary" disabled={busy} onClick={() => ask(match)}>{t('selfResolve')}</button>}
              </> : <><p>{t('manualFits')}</p><div className="actions">
                <button className="secondary" disabled={busy} onClick={() => run(async () => {
                  await send({action:'viewManual',id:match.id,version:match.version});
                  await refresh(token);
                  setManualId(match.id);
                })}>{t('showManual')}</button>
                <button className="link" disabled={busy} onClick={() => setResults({...results,
                  matches: results.matches.filter(candidate => candidate.id !== match.id)})}>{t('skipManual')}</button>
              </div></>}
            </article>)}
          </section>}
          <form className="panel flow ask" onSubmit={event => {
            event.preventDefault(); setManualId(''); setResults(undefined);
            run(async () => setResults(await send({action:'search',text:query,language})));
          }}>
            <div className="section-head"><span className="tile">?</span><div><div className="eyebrow">{t('help')}</div><h2>{t('hero')}</h2></div></div>
            <textarea id="new-consultation" aria-label={t('help')} placeholder={t('placeholder')} rows={3} maxLength={3000} required value={query} disabled={busy}
              onChange={event => {setQuery(event.target.value);setResults(undefined);setManualId('');}}/>
            {results?.matches.length === 0 && <p role="status">{t('noMatch')}</p>}
            <div className="actions"><button disabled={busy || listening || !query.trim()}>⌕ &nbsp; {t('search')}</button>
              {voiceSupported && <button className="secondary" type="button" disabled={busy || listening} onClick={()=>dictate()}>{t(listening ? 'listening' : 'voice')}</button>}
              <button className="secondary" type="button" disabled={busy||listening||!query.trim()} onClick={() => ask()}>{t('send')} →</button></div>
          </form>
          {!results&&questions.length>0&&<section className="panel flow"><div className="split"><h2>{t('recent')}</h2><button className="link" onClick={()=>changeTab('cases')}>{t('all')} →</button></div>{caseList(questions.slice(0,2))}</section>}
          {!results&&manuals.length>0&&<section className="panel flow"><h2>{{ja:'もう一度見る',en:'Open a guide again',vi:'Xem lại hướng dẫn'}[language]}</h2>{manuals.slice(0,2).map(item=><button className="secondary" key={item.id} onClick={()=>readManual(item)}>{(item.translations[language]??item.content).title}</button>)}</section>}
        </>}
        {tab === 'home' && manager && <>
          <div className="stats">{(['new','active','resolved'] as const).map(status => <button className="panel stat" key={status} onClick={() => {setStatusFilter(status); changeTab('cases');}}>
            <Badge variant={status}>{t(status)}</Badge><strong>{questions.filter(row => row.status === status).length}</strong></button>)}</div>
          <section className="panel flow"><div className="split"><h2>{t('recent')}</h2><button className="link" onClick={() => {setStatusFilter('all');changeTab('cases');}}>{t('all')} →</button></div>
            {caseList(questions.slice(0,4))}
          </section>
          <section className="panel flow"><div className="split"><h2>{t('manuals')}</h2><button className="link" onClick={() => changeTab('manuals')}>{t('all')} →</button></div>
            <div className="actions">{manuals.slice(0,5).map(row => <button className="secondary" key={row.id} onClick={() => openManual(row.id)}>{row.content.title}</button>)}</div>
          </section>
        </>}
        {tab === 'cases' && <>
          <section className="panel flow"><div className="split"><h2>{t('cases')}</h2><div className="actions">
            {manager && <select aria-label="対応状況" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value="all">すべて</option>{(['new','active','resolved'] as const).map(status => <option key={status} value={status}>{t(status)}</option>)}
            </select>}<button className="secondary" disabled={busy} onClick={() => run(async () => {await refresh(token);})}>{t('refresh')}</button>
          </div></div>{caseList(questions.filter(row => statusFilter === 'all' || row.status === statusFilter))}</section>
          {question && <section className="panel flow">
            <div className="split"><div className="eyebrow">{siteName(question.siteId)} · {manager ? question.category : languageNames[question.originalLanguage]}</div><Badge variant={question.status}>{t(question.status)}</Badge></div>
            {question.assigneeName&&<p className="muted">{{ja:'担当管理者',en:'Assigned manager',vi:'Quản lý phụ trách'}[language]}: {question.assigneeName}</p>}
            {manager&&question.status!=='resolved'&&(!question.assigneeId?<button className="secondary" disabled={busy} onClick={()=>run(async()=>{await send({action:'assign',id:question.id});await refresh(token);})}>対応する</button>:question.assigneeId===data.profile.id&&<details><summary>担当者を変更</summary><select aria-label="引き継ぎ先" value="" disabled={busy} onChange={event=>{const managerId=event.target.value;if(managerId)run(async()=>{await send({action:'assign',id:question.id,managerId});await refresh(token);});}}><option value="">引き継ぎ先を選択</option>{data.managers?.filter(person=>person.id!==data.profile.id&&person.siteIds.includes(site)).map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></details>)}
            <h2>{manager ? question.japaneseText || question.originalText : question.originalText}</h2>
            {manager && <div className="notice"><small>{question.japaneseText ? t('original') : t('unavailable')} · {languageNames[question.originalLanguage]}</small><p>{question.originalText}</p>{question.summary && <p>AI 要約 · {question.summary}</p>}</div>}
            {question.references.map(reference => <div className="notice" key={reference.kind + reference.id}>{reference.title} · {reference.answer}</div>)}
            <div className="messages">{question.messages.map(row=>{const own=row.senderId===data.profile.id,key=question.id+':'+row.id+':'+language,originalLanguage=row.sourceLanguage??(row.role==='manager'?'ja':question.originalLanguage),translated=chatTranslations[key]||(row.targetLanguage===language?row.translatedText:'');
              return <article key={row.id} className={'bubble '+(own?'own':'')}><small>{row.senderName?row.senderName+' · ':''}{t(row.role)} · {new Date(row.createdAt).toLocaleString(language)}</small>
              <p>{!own&&translated?translated:row.originalText}</p>
              {!own&&translated&&translated!==row.originalText&&<small className="chat-original">{t('original')} · {row.originalText}</small>}
              {!own&&!translated&&originalLanguage!==language&&<button className="link" disabled={busy} onClick={()=>run(async()=>{const result=await send<{translatedText:string}>({action:'retryTranslation',id:question.id,messageId:row.id,language});setChatTranslations(current=>({...current,[key]:result.translatedText}));})}>{{ja:'翻訳を再試行',en:'Retry translation',vi:'Thử dịch lại'}[language]}</button>}
              </article>;})}</div>
            {question.status !== 'resolved' ? <>
              {(!manager||!question.assigneeId||question.assigneeId===data.profile.id)&&<form className="actions" onSubmit={event => {event.preventDefault(); run(async () => {
                await send({action:'reply', id:question.id, text:message, messageId:crypto.randomUUID()}); setMessage(''); await refresh(token);
              });}}><input aria-label={t('message')} placeholder={t('message')} value={message} onChange={event => setMessage(event.target.value)} maxLength={3000} required/>
                {voiceSupported&&<button type="button" className="secondary" disabled={busy||listening} onClick={()=>dictate('reply')}>{listening?t('listening'):t('voice')}</button>}
                <button disabled={busy || !message.trim()}>{t('reply')} →</button></form>}
              {!manager && <div className="actions"><button type="button" className="secondary" disabled={busy} onClick={() => run(async () => {
                const resolved = await send<Question>({action:'resolve', id:question.id});
                setData(current => current && {...current, questions: current.questions.map(row =>
                  row.id === resolved.id && row.siteId === resolved.siteId ? resolved : row)});
              })}>{t('resolve')}</button></div>}
            </> : <>{question.resolution && <p className="notice">{t('resolution')} · {question.resolution}</p>}
              {manager && <div className="flow">
                {manuals.filter(item=>item.sourceQuestionIds.includes(question.id)).map(item=><button className="secondary" key={item.id} onClick={()=>openManual(item.id)}>{item.status==='published'?'公開済みマニュアルを見る':'マニュアルの確認へ'}</button>)}
                {!question.approvedForReuse && <label className="check"><input type="checkbox" checked={reuseConfirmed} onChange={event => setReuseConfirmed(event.target.checked)}/>
                  質問・回答・解決方法に共有できない情報が含まれていないことを確認しました</label>}
                <div className="actions"><button className="secondary" disabled={busy || (!question.approvedForReuse && !reuseConfirmed)} onClick={() => run(async () => {
                  await send({action:'reuse',id:question.id,approved:!question.approvedForReuse});setReuseConfirmed(false);await refresh(token);
                })}>{question.approvedForReuse ? '再利用承認を取り消す' : 'ナレッジ再利用を承認'}</button>
</div>
              </div>}
            </>}
          </section>}
        </>}
        {tab === 'manuals' && <>
          {manager ? <>
            <section className="panel flow">
              <h2>マニュアル確認</h2>
              <div className="manual-status-tabs" role="tablist" aria-label="確認状態">
                {(['draft','published'] as const).map(status=><button role="tab" key={status} aria-selected={manualStatus===status}
                  onClick={()=>{setManualStatus(status);setManualId('');}}>
                  {status==='draft' ? '未確認' : '確認済'}<span>{manuals.filter(row=>row.status===status).length}</span>
                </button>)}
              </div>
              {reviewManual ? <label className="manual-picker">マニュアルを選択
                <select value={reviewManual.id} onChange={event=>setManualId(event.target.value)}>
                  {manuals.filter(row=>row.status===manualStatus).map(row=><option value={row.id} key={row.id}>{row.content.title}（{row.status==='published'?'公開済':isGenerating(row)?'生成中':row.reviewState==='awaiting_answers'?'追加質問待ち':row.generation?.error==='source-review-required'?'生成前の確認待ち':row.reviewState==='held'?'保留':'承認待ち'}）</option>)}
                </select>
              </label> : <p className="empty">{t('empty')}</p>}
            </section>
            {reviewManual?.status==='published' && <ManualSend key={reviewManual.id+reviewManual.updatedAt} manual={reviewManual} staff={data.staff} deliveries={deliveries} busy={busy}
              onSend={async employeeIds=>{await send({action:'sendManual',id:reviewManual.id,version:reviewManual.updatedAt,employeeIds});await refresh(token);}}/>}
            {reviewManual && <ManualReview key={reviewManual.id} manual={reviewManual} questions={questions} busy={busy} ai={data.ai}
              staff={data.staff} saveAccess={access=>run(async()=>{await send({action:'manualAccess',id:reviewManual.id,version:reviewManual.updatedAt,access});setManualStatus('draft');setManualId(reviewManual.id);await refresh(token);})}
              sourceAction={action=>run(async()=>{await send({...action,id:reviewManual.id,version:reviewManual.updatedAt});await refresh(token);})}
              stats={data.manualStats?.[reviewManual.id]}
              answer={answers=>run(async()=>{await send({action:'answerManual',id:reviewManual.id,version:reviewManual.updatedAt,answers});await refresh(token);})}
              changeState={mode=>run(async()=>{await send({action:'manualState',id:reviewManual.id,version:reviewManual.updatedAt,mode});setManualStatus('draft');setManualId(reviewManual.id);await refresh(token);})}
              saveProgram={(program,publish,confirmPermissions)=>run(async()=>{await send({action:'saveProgram',id:reviewManual.id,version:reviewManual.updatedAt,program,publish,confirmPermissions});setManualStatus(publish?'published':'draft');setManualId(reviewManual.id);await refresh(token);})}
              regenerate={imagesOnly => run(async () => {
                await send({action:'regenerateManual',id:reviewManual.id,version:reviewManual.updatedAt,imagesOnly});
                setManualStatus('draft');setManualId(reviewManual.id);await refresh(token);
              })}
              save={(content,publish,edits) => run(async () => {
                await send({action:'saveManual',id:reviewManual.id,version:reviewManual.updatedAt,content,publish,...edits});
                setManualStatus(publish ? 'published' : 'draft');setManualId(reviewManual.id);await refresh(token);
              })}/>}
          </> : <>
            <ManualInbox deliveries={deliveries} manuals={manuals} language={language} busy={busy} onOpen={readManual}/>
            <section className="panel flow">
              <h2>{{ja:'参照したマニュアル',en:'Guides you have used',vi:'Tài liệu đã tham khảo'}[language]}</h2>
              <input aria-label={t('search')} placeholder={t('search')} value={manualFilter} onChange={event=>setManualFilter(event.target.value)}/>
              {manuals.filter(row=>!deliveries.some(delivery=>delivery.manualId===row.id)).length ? <div className="rows">{manuals.filter(row=>!deliveries.some(delivery=>delivery.manualId===row.id)&&(row.translations[language]??row.content).title.toLocaleLowerCase().includes(manualFilter.trim().toLocaleLowerCase())).map(row => <button className="row" key={row.id} onClick={() => readManual(row)}>
                <span className="tile">▤</span><span className="row-text"><strong>{(row.translations[language] ?? row.content).title}</strong><small>{siteName(row.siteId)}</small></span>
                <span>›</span></button>)}</div> : <p className="empty">{t('empty')}</p>}
            </section>
            {manual && <ManualView manual={manual} language={language} onEvent={manualEvent(manual)}/>}
          </>}
        </>}
        <footer>Bridge Work <span>·</span> {siteName(site)}</footer>
  </WorkspaceShell>;
}
