'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { copy } from '../lib/copy';
import { languageNames, languages, type Language, type Manual, type ManualContent, type Question } from '../lib/model';
import { stairRange } from '../lib/diagrams';
import { RangeDiagram } from './range-diagram';

export function isGenerating(manual: Manual) {
  return Boolean(manual.generation && ['queued','writing','illustrating'].includes(manual.generation.state) &&
    Date.now() - Date.parse(manual.generation.startedAt) < 180_000);
}

export function ManualView({manual, language, onSelectStep}: {manual: Manual; language: Language; onSelectStep?:(index:number)=>void}) {
  const [displayLanguage,setDisplayLanguage] = useState(language);
  useEffect(()=>setDisplayLanguage(language),[language]);
  const content = manual.translations[displayLanguage] ?? manual.content;
  const t = (key: Parameters<typeof copy>[1]) => copy(displayLanguage,key);
  const perStep = manual.imageLayout === 'steps';
  const range = stairRange(manual.content.steps.join(' '));
  return <article className="manual-document" aria-label={t('manuals')}>
    <div className="manual-meta"><span className="manual-site"><span aria-hidden="true">▥</span>{manual.siteId === 'sakura' ? 'さくらビル' : manual.siteId}</span>
      <span className={'badge '+(manual.status === 'published' ? 'resolved' : 'active')}>{manual.status === 'published' ? t('reviewed') : t('unreviewed')}</span></div>
    <div className="manual-languages" role="group" aria-label="Language">
      {languages.map(code=><button type="button" key={code} aria-pressed={displayLanguage===code}
        onClick={()=>setDisplayLanguage(code)}>{languageNames[code]}</button>)}
    </div>
    <header className="manual-question">
      <div className="eyebrow">{t('manualQuestion')}</div>
      <h2>{content.title}</h2>
      {displayLanguage !== 'ja' && !manual.translations[displayLanguage] && <p className="manual-language">{t('onlyJapanese')}</p>}
    </header>
    <section className="manual-procedure">
      <div className="manual-section-heading"><h3>{t('procedure')}</h3></div>
      {range && <RangeDiagram range={range} language={displayLanguage}/>}
      <ol className={range ? 'range-instructions' : 'procedure-grid'}>
        {content.steps.map((step,index) => <li className="procedure-card" key={index}>
          {!range && <div className="procedure-visual">
            <span className="procedure-number">{String(index + 1).padStart(2,'0')}</span>
            {perStep && manual.imageUrls[index] ? <img src={manual.imageUrls[index]} alt={step} loading="lazy"/> :
              <span className="procedure-symbol" aria-hidden="true">{index === content.steps.length - 1 ? '✓' : '→'}</span>}
          </div>}
          {onSelectStep ? <button className="procedure-text" onClick={()=>onSelectStep(index)}><span aria-hidden="true">{range ? '✓' : String(index+1).padStart(2,'0')}</span>{step}</button> :
            <p className="procedure-text"><span aria-hidden="true">{range ? '✓' : String(index+1).padStart(2,'0')}</span>{step}</p>}
        </li>)}
      </ol>
      {!range && !perStep && manual.imageUrls.map(url => <img className="procedure-image" key={url} src={url} alt={t('procedureImage')} loading="lazy"/>)}
    </section>
    {content.cautions.length > 0 && <section className="manual-cautions">
      <h3><span aria-hidden="true">!</span>{t('cautions')}</h3>
      <ul>{content.cautions.map((line,index) => <li key={index}>{line}</li>)}</ul>
    </section>}
  </article>;
}

const errors: Record<string,string> = {
  prepay:'Gemini API の前払い残高がありません。AI Studio で残高を追加した後、図解を再生成できます。',
  quota:'画像生成の利用枠が不足しています。課金したプロジェクトのキーと割り当てを確認してから再生成できます。',
  'not-configured':'Gemini キーを設定すると、会話の整理と図解の生成を利用できます。',
  'text-unavailable':'会話から対処法を抽出できませんでした。時間をおいて再生成してください。',
  'unverified-source':'会話で根拠を確認できない文章がありました。元の会話を確認して再生成してください。',
  'source-missing':'対処法の根拠となる管理者の回答が不足しています。内容を編集して保存できます。',
  'content-changed':'対処法が変更されています。図解を再生成して文章と合っているか確認してください。',
  'model-unavailable':'設定されている画像モデルを利用できません。',
  'access-denied':'画像生成へのアクセスを確認してください。',
  'image-timeout':'画像生成が時間内に完了しませんでした。図解を再生成できます。',
  'no-image':'画像を取得できませんでした。図解を再生成できます。',
  'provider-error':'生成サービスから結果を取得できませんでした。再度お試しください。',
  'image-too-large':'生成画像のサイズが保存上限を超えました。図解を再生成できます。'
};
export function ManualReview({manual, questions, busy, ai, regenerate, save}: {
  manual: Manual; questions: Question[]; busy: boolean; ai: boolean;
  regenerate: (imagesOnly:boolean) => void;
  save: (content:ManualContent,publish:boolean) => void;
}) {
  const generating = isGenerating(manual);
  const state = manual.generation?.state;
  const [editing,setEditing] = useState(false);
  const [selectedStep,setSelectedStep] = useState(0);
  const sources = questions.filter(question => manual.sourceQuestionIds.includes(question.id));
  const citations = manual.evidence?.steps[selectedStep] ?? [];
  const highlighted = new Set(citations.map(citation=>citation.messageId));
  const fallbackReply = sources.flatMap(source=>source.messages).filter(message=>message.role==='manager').at(-1);
  if (!highlighted.size && fallbackReply) highlighted.add(fallbackReply.id);
  const stateLabel = generating ? state === 'illustrating' ? '手順に合わせた図解を生成中' : '会話から対処法を整理中' :
    state === 'failed' ? '生成内容の確認が必要です' : manual.status === 'published' ? '確認済みのマニュアル' : '公開前の内容確認';
  return <section className="panel flow review-panel">
    <div className="split"><div><div className="eyebrow">MANUAL STUDIO</div><h2>{stateLabel}</h2></div>
      <span className={'badge ' + (manual.status === 'published' ? 'resolved' : 'active')}>{manual.status === 'published' ? '確認済' : '未確認'}</span></div>
    <div className="generation-track" role="status" aria-live="polite">
      {['会話を整理','図解を生成','管理者が確認'].map((label,index) => <span key={label}
        className={generating ? index === (state === 'illustrating' ? 1 : 0) ? 'progress-active' : '' : index === 2 ? 'progress-active' : 'progress-done'}>
        <b>{index + 1}</b>{label}
      </span>)}
    </div>
    {state === 'failed' && <p className="notice">{errors[manual.generation?.error ?? 'provider-error'] ?? errors['provider-error']}</p>}
    {manual.generation && !generating && ['queued','writing','illustrating'].includes(state ?? '') &&
      <p className="notice">生成が中断された可能性があります。再生成して続行できます。</p>}
    <div className="actions">
      <button className="secondary" disabled={busy || generating || !ai || !sources.length} onClick={() => regenerate(false)}>✧ 会話から作り直す</button>
      <button className="secondary" disabled={busy || generating || !ai} onClick={() => regenerate(true)}>▧ 図解を再生成</button>
      <button className="link" disabled={generating} onClick={() => setEditing(!editing)} aria-expanded={editing}>{editing ? '編集を閉じる' : '編集する'}</button>
    </div>
    <div className="manual-review-columns">
      <section className="review-conversation">
        <h3 className="review-column-heading"><span aria-hidden="true">◌</span>元の会話</h3>
        <div className="review-conversation-body">{sources.length ? sources.map(question => <div className="flow" key={question.id}>
          <article className="source-message employee"><span className="source-avatar" aria-hidden="true">人</span><div><strong>スタッフ</strong>
            <p>{question.japaneseText || question.originalText}</p></div></article>
          {question.messages.map(message=><article key={message.id} className={'source-message '+message.role+(highlighted.has(message.id) ? ' highlighted' : '')}>
            <span className="source-avatar" aria-hidden="true">{message.role==='manager' ? '管' : '人'}</span><div>
              <strong>{message.role==='manager' ? '管理者' : 'スタッフ'}</strong><p>{message.role==='manager' ? message.originalText : message.translatedText || message.originalText}</p>
            </div>
          </article>)}
        </div>) : <p className="muted">参照した会話がありません。</p>}</div>
      </section>
      <section className="review-preview">
        <h3 className="review-column-heading"><span aria-hidden="true">▤</span>作成されたマニュアル（プレビュー）</h3>
        <div className="review-preview-body"><ManualView manual={manual} language="ja" onSelectStep={setSelectedStep}/>
          {(citations.length>0 || fallbackReply) && <aside className="evidence-callout"><strong><span aria-hidden="true">↔</span> 根拠となる回答</strong>
            {(citations.length ? citations.map(source=>source.quote) : [fallbackReply!.originalText]).map((quote,index)=><blockquote key={index}>「{quote}」</blockquote>)}
          </aside>}
        </div>
      </section>
    </div>
    {!generating && (editing ? <ManualEditor key={manual.id + manual.updatedAt} manual={manual} busy={busy} save={(content,publish)=>{save(content,publish);}}/> :
      <ReviewApproval key={manual.id+manual.updatedAt} manual={manual} busy={busy} onEdit={()=>setEditing(true)} save={save}/>)}
  </section>;
}

function ReviewApproval({manual,busy,onEdit,save}: {manual:Manual; busy:boolean; onEdit:()=>void; save:(content:ManualContent,publish:boolean)=>void}) {
  const [checked,setChecked] = useState(false);
  return <div className="review-approval">
    <label className="check"><input type="checkbox" checked={checked} onChange={event=>setChecked(event.target.checked)}/>会話・作業条件・図解の一致を確認</label>
    <div className="actions"><button className="secondary" disabled={busy} onClick={onEdit}>編集する</button>
      <button disabled={busy || !checked || manual.status==='published'} onClick={()=>save(manual.content,true)}>✓ 確認済にする</button></div>
  </div>;
}

function ManualEditor({manual,busy,save}: {manual:Manual; busy:boolean; save:(content:ManualContent,publish:boolean)=>void}) {
  const [title,setTitle] = useState(manual.content.title);
  const [steps,setSteps] = useState(manual.content.steps);
  const [cautions,setCautions] = useState(manual.content.cautions);
  const [confirmed,setConfirmed] = useState(false);
  const content = {...manual.content,title,steps,cautions};
  const changedSteps = JSON.stringify(steps) !== JSON.stringify(manual.content.steps);
  const canPublish = !busy && confirmed && !changedSteps;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const publish = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'publish';
    if (publish && !canPublish) return;
    save({...content, title:title.trim(), steps:steps.map(step=>step.trim()), cautions:cautions.map(line=>line.trim()).filter(Boolean)},publish);
  }
  function changeStep(index:number,value:string) {
    setSteps(current => current.map((step,i) => i === index ? value : step)); setConfirmed(false);
  }
  return <form className="flow manual-editor" onSubmit={submit}>
    <div className="split"><h3>内容を整える</h3><span className="muted">編集内容を保存してプレビューに反映</span></div>
    <label>質問内容<input required maxLength={250} value={title} onChange={event => {setTitle(event.target.value);setConfirmed(false);}}/></label>
    <fieldset><legend>対処法</legend>{steps.map((step,index) => <div className="edit-step" key={index}>
      <label><span>STEP {String(index + 1).padStart(2,'0')}</span><textarea rows={2} required maxLength={500} value={step} onChange={event => changeStep(index,event.target.value)}/></label>
      {manual.evidence?.steps[index]?.length && !changedSteps ? <details className="step-evidence"><summary>根拠となる回答</summary>
        {manual.evidence.steps[index].map((source,i) => <blockquote key={i}>{source.quote}</blockquote>)}</details> : null}
      <div className="actions">
        <button className="link" type="button" disabled={index===0 || busy} onClick={() => {
          const next=[...steps]; [next[index-1],next[index]]=[next[index],next[index-1]]; setSteps(next);setConfirmed(false);
        }}>↑ 上へ</button>
        <button className="link" type="button" disabled={steps.length===1 || busy} onClick={() => {setSteps(steps.filter((_,i)=>i!==index));setConfirmed(false);}}>削除</button>
      </div>
    </div>)}
    <button className="secondary" type="button" disabled={steps.length>=12 || busy} onClick={() => {setSteps([...steps,'']);setConfirmed(false);}}>＋ 手順を追加</button></fieldset>
    <label>注意事項 <span className="muted">会話に注意がある場合のみ記入</span><textarea rows={2} maxLength={4000} value={cautions.join('\n')}
      onChange={event => {setCautions(event.target.value ? event.target.value.split('\n') : []);setConfirmed(false);}}/></label>
    {changedSteps && <p className="notice">手順を変更した場合は、保存後に図解を再生成し、内容を確認してください。</p>}
    <label className="check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>
      会話との一致、作業条件、文章と図の対応を確認しました</label>
    <div className="actions"><button className="secondary" disabled={busy} value="draft">未確認として保存</button>
      <button disabled={!canPublish} value="publish">✓ 確認済にする</button></div>
  </form>;
}

