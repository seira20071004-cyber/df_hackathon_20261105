'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { copy } from '../lib/copy';
import { languageNames, languages, type Language, type Manual, type ManualContent, type Match, type Question, type Workspace } from '../lib/model';

type Tab = 'home' | 'cases' | 'manuals';
const manualFields = ['title','steps','cautions'] as const;
const glyphs = {home:'⌂', cases:'◫', manuals:'▤'};
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
function ManualView({manual, language}: {manual: Manual; language: Language}) {
  const content = manual.translations[language] ?? manual.content;
  const t = (key: Parameters<typeof copy>[1]) => copy(language, key);
  return <article className="panel manual">
    <div className="eyebrow">{t('manualQuestion')}</div><h2>{content.title}</h2>
    {language !== 'ja' && !manual.translations[language] && <p className="muted">{t('onlyJapanese')}</p>}
    <h3>{t('procedure')}</h3>
    <ol className="steps">{content.steps.map((step,index) => <li key={index}><span>{String(index + 1).padStart(2,'0')}</span>{step}</li>)}</ol>
    {manual.imageUrls.map(url => <img className="procedure-image" key={url} src={url} alt={t('procedureImage')} loading="lazy"/>)}
    {content.cautions.length > 0 && <section><h3>{t('cautions')}</h3><ul>{content.cautions.map((line,index) => <li key={index}>{line}</li>)}</ul></section>}
  </article>;
}
function Editor({manual, busy, save}: {manual: Manual; busy: boolean; save: (content: ManualContent,publish:boolean) => void}) {
  const [fields, setFields] = useState(() => Object.fromEntries(manualFields.map(key => [key, Array.isArray(manual.content[key]) ? manual.content[key].join('\n') : manual.content[key]])) as Record<typeof manualFields[number],string>);
  const [confirmed, setConfirmed] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const publish = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'publish';
    if (publish && !confirmed) return;
    const lines = (key: keyof typeof fields) => fields[key].split('\n').map(value => value.trim()).filter(Boolean);
    save({...manual.content, title: fields.title, steps: lines('steps'), cautions: lines('cautions')}, publish);
  }
  return <form className="panel flow" onSubmit={submit}>
    <h2>マニュアルを確認・編集</h2><p className="muted">リストは1項目ずつ改行してください。現場の条件と安全に関わる指示を確認してください。</p>
    {manualFields.map(key => <label key={key}>{copy('ja', key === 'title' ? 'manualQuestion' : key === 'steps' ? 'procedure' : 'cautions')}
      {key === 'title' ? <input required maxLength={500} value={fields[key]} onChange={event => {setConfirmed(false); setFields({...fields,[key]:event.target.value});}} /> :
        <textarea rows={3} required={key === 'steps'} maxLength={6000} value={fields[key]} onChange={event => {setConfirmed(false); setFields({...fields,[key]:event.target.value});}} />}
    </label>)}
    <label className="check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 作業条件と手順を確認しました</label>
    <div className="actions"><button className="secondary" disabled={busy} value="draft">未確認として保存</button><button disabled={busy || !confirmed} value="publish">確認済にする</button></div>
  </form>;
}

export default function BridgeWork() {
  const [token,setToken] = useState('');
  const [data,setData] = useState<Workspace>();
  const [demo,setDemo] = useState<boolean>();
  const [language,setLanguage] = useState<Language>('ja');
  const [tab,setTab] = useState<Tab>('home');
  const [site,setSite] = useState('');
  const [selected,setSelected] = useState('');
  const [manualId,setManualId] = useState('');
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
    const response = await fetch('/api/bridge' + suffix, {
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
    request<{demo:boolean}>('',undefined,'?config').then(value => setDemo(value.demo)).catch(() => setError('server-error'));
    const saved = sessionStorage.getItem('bridge-token');
    if (saved) enter(saved).catch(() => sessionStorage.removeItem('bridge-token'));
  }, [enter,request]);
  useEffect(() => {document.documentElement.lang = language;}, [language]);
  useEffect(() => {setVoiceSupported(Boolean(speechRecognition()));}, []);
  useEffect(() => {
    if (!token || busy) return;
    const timer = setInterval(() => {if (!document.hidden) refresh(token).catch(() => undefined);}, 10000);
    return () => clearInterval(timer);
  }, [token,busy,refresh]);

  async function run(work: () => Promise<void>) {
    setBusy(true); setError('');
    try {await work();} catch (caught) {setError(caught instanceof Error ? caught.message : 'server-error');}
    finally {setBusy(false);}
  }
  function changeTab(next: Tab) {setTab(next); setError('');}
  function openCase(id: string) {
    setSelected(id); setMessage(''); setReuseConfirmed(false); changeTab('cases');
  }
  function openManual(id: string) {setManualId(id); changeTab('manuals');}
  function dictate() {
    const Recognition = speechRecognition();
    if (!Recognition) return;
    const input = new Recognition();
    input.lang = {ja:'ja-JP', en:'en-US', vi:'vi-VN'}[language];
    input.onresult = event => {
      const spoken = event.results[0]?.[0]?.transcript;
      if (spoken) {
        setQuery(current => (current ? current + ' ' + spoken : spoken).slice(0,3000));
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
  const send = <T,>(payload: object) => request<T>(token, {siteId:site,...payload});
  function ask(match?: Match) {
    run(async () => {
      const created = await send<Question>({action:match ? 'selfResolve' : 'ask', id:crypto.randomUUID(), text:query, language,
        ...(match ? {matchId:match.id,kind:match.kind} : {})});
      await refresh(token);
      setQuery(''); setResults(undefined); openCase(created.id);
    });
  }
  const errorText = error === 'conversation-updated' ? t('conversationUpdated') : error === 'voice-error' ? t('voiceError') : error === 'review-steps' ? '確認が必要な手順を編集してから公開してください。'
    : error === 'stale-manual' ? '別の操作で更新されました。画面を更新してから編集してください。'
    : error === 'login-required' ? 'セッションの有効期限が切れました。ログアウトして再ログインしてください。' : t('error');

  if (!data) return <main className="login-shell"><section className="login panel flow">
    <Brand/><div className="eyebrow">MULTILINGUAL WORKPLACE SUPPORT</div><h1>職場の「困った」を<br/>みんなの「わかる」に。</h1>
    <p>母語で相談し、現場の知恵を次のスタッフへ。</p>
    {error && <p role="alert" className="alert">{errorText}</p>}
    {demo === undefined && !error && <p className="muted">読み込み中…</p>}
    {demo === true && <><Badge variant="demo">{t('demo')}</Badge>
      <button disabled={busy} onClick={() => run(() => enter('linh'))}>Linh Nguyễn · Nhân viên / スタッフ <span>→</span></button>
      <button className="secondary" disabled={busy} onClick={() => run(() => enter('sato'))}>佐藤 美咲 · 管理者 <span>→</span></button>
      <button className="secondary" disabled={busy} onClick={() => run(() => enter('alex'))}>Alex Smith · Staff <span>→</span></button></>}
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

  return <div className="app-shell">
    <aside className="sidebar">
      <Brand/><div className="eyebrow nav-label">{t('workspace')}</div>
      <nav aria-label={t('workspace')}>{(['home','cases','manuals'] as Tab[]).map(item =>
        <button key={item} className={'nav-button ' + (tab === item ? 'current' : '')} aria-current={tab === item ? 'page' : undefined} onClick={() => changeTab(item)}>
          <span aria-hidden="true">{glyphs[item]}</span>{manager && item === 'home' ? 'ダッシュボード' : t(item)}
        </button>)}</nav>
      <div className="account"><span className="avatar">{data.profile.name.slice(0,1)}</span><div><strong>{data.profile.name}</strong><small>{t(data.profile.role)}</small></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <strong>{manager && tab === 'home' ? 'ダッシュボード' : t(tab)}</strong>
        <div className="top-actions">
          {data.demo && <Badge variant="demo">{t('demo')}</Badge>}
          <select aria-label={t('site')} value={site} disabled={busy || listening} onChange={event => {
            setSite(event.target.value); setSelected(''); setManualId(''); setResults(undefined);
          }}>{data.profile.siteIds.map(id => <option key={id} value={id}>{siteName(id)}</option>)}</select>
          <select aria-label="Language" value={language} disabled={busy || listening} onChange={event => {
            const next = event.target.value as Language;
            setLanguage(next); setResults(undefined); localStorage.setItem('bridge-language-' + data.profile.id,next);
            request(token,{action:'language',language:next}).catch(() => setError('server-error'));
          }}>{languages.map(code => <option key={code} value={code}>{languageNames[code]}</option>)}</select>
          <button className="link" disabled={busy || listening} onClick={() => {
            sessionStorage.removeItem('bridge-token'); setToken(''); setData(undefined); setLanguage('ja'); setQuery(''); setResults(undefined); setSelected('');
            setManualId(''); setMessage(''); setReuseConfirmed(false); setError(''); setTab('home'); setStatusFilter('all');
          }}>{t('signout')}</button>
        </div>
      </header>
      <main className="content flow">
        {error && <p className="alert" role="alert">{errorText}</p>}
        {busy && <p className="busy" role="status">{t('searching')}</p>}
        {tab === 'home' && !manager && <>
          <form className="panel flow ask" onSubmit={event => {event.preventDefault(); setManualId(''); run(async () => setResults(await send({action:'search',text:query,language})));}}>
            <div className="section-head"><span className="tile">?</span><div><div className="eyebrow">{t('help')}</div><h2>{t('hero')}</h2></div></div>
            <textarea aria-label={t('help')} placeholder={t('placeholder')} rows={3} maxLength={3000} required value={query} disabled={busy}
              onChange={event => {setQuery(event.target.value);setResults(undefined);setManualId('');}}/>
            <div className="actions"><button disabled={busy || listening || !query.trim()}>⌕ &nbsp; {t('search')}</button>
              {voiceSupported && <button className="secondary" type="button" disabled={busy || listening} onClick={dictate}>{t(listening ? 'listening' : 'voice')}</button>}
              {results && <button className="secondary" type="button" disabled={busy} onClick={() => ask()}>{t('send')} →</button>}</div>
          </form>
          {results && <section className="panel flow"><h2>{t('similar')}</h2>
            {!results.matches.length ? <p>{t('noMatch')}</p> : <><p className="notice">{t('confirmSite')}</p>{!results.ai && <p className="muted">{t('fallback')}</p>}</>}
            {results.matches.map(match => <article className="result flow" key={match.kind + match.id}>
              <div className="eyebrow">{siteName(match.siteId)} · {t(match.kind === 'manual' ? 'manuals' : 'cases')}</div>
              <h3>{match.title}</h3>
              {manual?.id === match.id ? <>
                <ManualView manual={manual} language={language}/>
                <button className="secondary" disabled={busy} onClick={() => ask(match)}>{t('selfResolve')}</button>
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
        </>}
        {tab === 'home' && manager && <>
          <div className="stats">{(['new','active','resolved'] as const).map(status => <button className="panel stat" key={status} onClick={() => {setStatusFilter(status); changeTab('cases');}}>
            <Badge variant={status}>{t(status)}</Badge><strong>{questions.filter(row => row.status === status).length}</strong></button>)}</div>
          <section className="panel flow"><div className="split"><h2>{t('manuals')}</h2><button className="link" onClick={() => changeTab('manuals')}>{t('all')} →</button></div>
            <div className="actions">{manuals.slice(0,5).map(row => <button className="secondary" key={row.id} onClick={() => openManual(row.id)}>{row.content.title}</button>)}</div>
          </section>
        </>}
        {tab === 'home' && manager && <section className="panel flow"><div className="split"><h2>{t('recent')}</h2><button className="link" onClick={() => {setStatusFilter('all');changeTab('cases');}}>{t('all')} →</button></div>
          {caseList(questions.slice(0,4))}
        </section>}
        {tab === 'cases' && <>
          <section className="panel flow"><div className="split"><h2>{t('cases')}</h2><div className="actions">
            {manager && <select aria-label="対応状況" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value="all">すべて</option>{(['new','active','resolved'] as const).map(status => <option key={status} value={status}>{t(status)}</option>)}
            </select>}<button className="secondary" disabled={busy} onClick={() => run(async () => {await refresh(token);})}>{t('refresh')}</button>
          </div></div>{caseList(questions.filter(row => statusFilter === 'all' || row.status === statusFilter))}</section>
          {question && <section className="panel flow">
            <div className="split"><div className="eyebrow">{siteName(question.siteId)} · {manager ? question.category : languageNames[question.originalLanguage]}</div><Badge variant={question.status}>{t(question.status)}</Badge></div>
            <h2>{manager ? question.japaneseText || question.originalText : question.originalText}</h2>
            {manager && <div className="notice"><small>{question.japaneseText ? t('original') : t('unavailable')} · {languageNames[question.originalLanguage]}</small><p>{question.originalText}</p>{question.summary && <p>AI 要約 · {question.summary}</p>}</div>}
            {question.references.map(reference => <div className="notice" key={reference.kind + reference.id}>{reference.title} · {reference.answer}</div>)}
            <div className="messages">{question.messages.map(row => <article key={row.id} className={'bubble ' + (row.role === data.profile.role ? 'own' : '')}>
              <small>{t(row.role)} · {new Date(row.createdAt).toLocaleString(language)}</small>
              <p>{row.translatedText && row.role !== data.profile.role ? row.translatedText : row.originalText}</p>
              {row.role !== data.profile.role && (row.translatedText && row.translatedText !== row.originalText ?
                <details><summary>{t('translation')} / {t('original')}</summary><p>{row.originalText}</p></details> : !row.translatedText && <small>{t('unavailable')}</small>)}
            </article>)}</div>
            {question.status !== 'resolved' ? <>
              <form className="actions" onSubmit={event => {event.preventDefault(); run(async () => {
                await send({action:'reply', id:question.id, text:message, messageId:crypto.randomUUID()}); setMessage(''); await refresh(token);
              });}}><input aria-label={t('message')} placeholder={t('message')} value={message} onChange={event => setMessage(event.target.value)} maxLength={3000} required/>
                <button disabled={busy || !message.trim()}>{t('reply')} →</button></form>
              {!manager && <div className="actions"><button className="secondary" disabled={busy} onClick={() => run(async () => {
                await send({action:'resolve', id:question.id}); await refresh(token);
              })}>{t('resolve')}</button></div>}
            </> : <>{question.resolution && <p className="notice">{t('resolution')} · {question.resolution}</p>}
              {manager && <div className="flow">
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
          {(manager ? ['draft','published'] as const : ['published'] as const).map(status => {
            const rows = manuals.filter(row => row.status === status);
            return <section className="panel flow" key={status}>
              <h2>{manager ? status === 'draft' ? '未確認' : '確認済' : t('manuals')}</h2>
              {rows.length ? <div className="rows">{rows.map(row => <button className="row" key={row.id} onClick={() => openManual(row.id)}>
                <span className="tile">▤</span><span className="row-text"><strong>{(row.translations[language] ?? row.content).title}</strong><small>{siteName(row.siteId)}</small></span>
                <span>›</span></button>)}</div> : <p className="empty">{t('empty')}</p>}
            </section>;
          })}
          {manual && <ManualView manual={manual} language={language}/>}
          {manual && manager && <Editor key={manual.id + manual.updatedAt} manual={manual} busy={busy} save={(content,publish) => run(async () => {
            await send({action:'saveManual',id:manual.id,version:manual.updatedAt,content,publish});await refresh(token);
          })}/>}
        </>}
        <footer>Bridge Work <span>·</span> {siteName(site)}</footer>
      </main>
    </div>
  </div>;
}
