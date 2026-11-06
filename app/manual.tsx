'use client';

import { useEffect, useRef, useState } from 'react';
import { copy } from '../lib/copy';
import { languageNames, languages, type Language, type Manual, type ManualContent, type ManualEdits, type Question } from '../lib/model';
import { stairRange } from '../lib/diagrams';
import { RangeDiagram } from './range-diagram';
import { ManualEditor } from './manual-editor';

export function isGenerating(manual: Manual) {
  return Boolean(manual.generation && ['queued','analyzing','writing','validating','illustrating'].includes(manual.generation.state) &&
    Date.now() - Date.parse(manual.generation.startedAt) < 300_000);
}

export function ManualView({manual, language, onSelectStep}: {manual: Manual; language: Language; onSelectStep?:(index:number)=>void}) {
  const [displayLanguage,setDisplayLanguage] = useState(language);
  const documentRef=useRef<HTMLElement>(null);
  const [exporting,setExporting]=useState(false);
  const [exportError,setExportError]=useState('');
  useEffect(()=>setDisplayLanguage(language),[language]);
  const content = manual.translations[displayLanguage] ?? manual.content;
  const t = (key: Parameters<typeof copy>[1]) => copy(displayLanguage,key);
  const perStep = manual.imageLayout === 'steps';
  const range = stairRange(manual.content.steps.join(' '));
  const figuresAt=(afterStep:number)=>(manual.figures ?? []).filter(figure=>figure.afterStep===afterStep).map(figure=><figure className="manual-inserted-figure" key={figure.id}>
    <img src={figure.url} alt={figure.caption || t('procedureImage')}/>{figure.caption && <figcaption>{figure.caption}</figcaption>}
  </figure>);
  async function download(format:'pdf'|'jpeg') {
    setExporting(true);setExportError('');
    try {const {downloadManual}=await import('./manual-export');await downloadManual(manual,displayLanguage,format,documentRef.current?.querySelector('svg') ?? null);}
    catch{setExportError('ダウンロードできませんでした。画像の読み込みを確認して、もう一度お試しください。');}
    finally{setExporting(false);}
  }
  return <div className="manual-with-download"><div className="manual-downloads" aria-label="マニュアルをダウンロード">
    <span className="badge">A4 · 1枚</span>
    <button className="secondary" type="button" disabled={exporting} onClick={()=>download('pdf')}>↓ PDF</button>
    <button className="secondary" type="button" disabled={exporting} onClick={()=>download('jpeg')}>↓ JPEG</button>
    {exporting && <span role="status">作成中…</span>}{exportError && <p role="alert">{exportError}</p>}
  </div><article ref={documentRef} className="manual-document" aria-label={t('manuals')}>
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
      {figuresAt(-1)}
      <ol className={range ? 'range-instructions' : 'procedure-grid'}>
        {content.steps.map((step,index) => <li className="procedure-card" key={index}>
          {(!range || (perStep && manual.imageUrls[index])) && <div className="procedure-visual">
            <span className="procedure-number">{String(index + 1).padStart(2,'0')}</span>
            {perStep && manual.imageUrls[index] ? <img src={manual.imageUrls[index]} alt={step} loading="lazy"/> :
              <span className="procedure-symbol" aria-hidden="true">{index === content.steps.length - 1 ? '✓' : '→'}</span>}
          </div>}
          {onSelectStep ? <button className="procedure-text" onClick={()=>onSelectStep(index)}><span aria-hidden="true">{range ? '✓' : String(index+1).padStart(2,'0')}</span>{step}</button> :
            <p className="procedure-text"><span aria-hidden="true">{range ? '✓' : String(index+1).padStart(2,'0')}</span>{step}</p>}
          {figuresAt(index)}
        </li>)}
      </ol>
      {!range && !perStep && manual.imageUrls.map(url => <img className="procedure-image" key={url} src={url} alt={t('procedureImage')} loading="lazy"/>)}
    </section>
    {content.cautions.length > 0 && <section className="manual-cautions">
      <h3><span aria-hidden="true">!</span>{t('cautions')}</h3>
      <ul>{content.cautions.map((line,index) => <li key={index}>{line}</li>)}</ul>
    </section>}
  </article></div>;
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
  ,'context-unresolved':'会話に矛盾や必要情報の不足があります。管理者の回答を確認してください。'
  ,'semantic-mismatch':'原文との照合で不一致が見つかりました。下の検査結果を確認して再生成または編集してください。'
  ,'verification-unavailable':'原文との照合が完了しませんでした。確認済にはせず、再生成してください。'
  ,'context-limit':'会話が処理上限を超えています。会話を切り捨てずに生成を停止しました。'
  ,'context-scope':'現場の範囲を確認できないため、生成を停止しました。'
};
export function ManualReview({manual, questions, busy, ai, regenerate, save}: {
  manual: Manual; questions: Question[]; busy: boolean; ai: boolean;
  regenerate: (imagesOnly:boolean) => void;
  save: (content:ManualContent,publish:boolean,edits?:ManualEdits) => void;
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
  const stateLabel = generating ? state === 'illustrating' ? '手順に合わせた図解を生成中' : state==='validating' ? '原文との意味・条件の一致を照合中' : state==='analyzing' ? '確定情報と訂正を抽出中' : '会話から対処法を整理中' :
    state === 'failed' ? '生成内容の確認が必要です' : manual.status === 'published' ? '確認済みのマニュアル' : '公開前の内容確認';
  return <section className="panel flow review-panel">
    <div className="split"><div><div className="eyebrow">MANUAL STUDIO</div><h2>{stateLabel}</h2></div>
      <span className={'badge ' + (manual.status === 'published' ? 'resolved' : 'active')}>{manual.status === 'published' ? '確認済' : '未確認'}</span></div>
    <div className="generation-track" role="status" aria-live="polite">
      {['確定情報を抽出','手順を編集','原文と照合','図解を生成','管理者が確認'].map((label,index) => <span key={label}
        className={generating ? index === (state === 'illustrating' ? 3 : state==='validating' ? 2 : state==='writing' ? 1 : 0) ? 'progress-active' : '' : index === 4 ? 'progress-active' : 'progress-done'}>
        <b>{index + 1}</b>{label}
      </span>)}
    </div>
    {state === 'failed' && <p className="notice">{errors[manual.generation?.error ?? 'provider-error'] ?? errors['provider-error']}</p>}
    {manual.generation && !generating && ['queued','analyzing','writing','validating','illustrating'].includes(state ?? '') &&
      <p className="notice">生成が中断された可能性があります。再生成して続行できます。</p>}
    {manual.pipeline && <details className="pipeline-report"><summary>原文との照合：{manual.pipeline.verification==='passed' ? '一致を確認（管理者の確認が必要）' : manual.pipeline.verification==='blocked' ? '不一致・不足あり' : manual.pipeline.verification==='edited' ? '管理者が編集・AI照合対象外' : '処理中・未完了'}</summary>
      <dl><div><dt>確定情報</dt><dd>{manual.pipeline.factCount}件／訂正前として除外 {manual.pipeline.supersededCount}件</dd></div>
        <div><dt>参照した会話</dt><dd>{manual.pipeline.messageCount}発言・この現場の相談のみ</dd></div>
        <div><dt>生成設定</dt><dd>{manual.pipeline.provider==='vertex' ? 'Vertex AI' : 'Gemini API'} · {manual.pipeline.model} · {manual.pipeline.promptVersion}</dd></div>
        <div><dt>会話の識別子</dt><dd><code>{manual.pipeline.contextHash.slice(0,16)}</code></dd></div></dl>
      {manual.pipeline.issues.length>0 && <ul>{manual.pipeline.issues.map((issue,index)=><li key={index}>{issue}</li>)}</ul>}
      {Boolean(manual.pipeline.facts?.length) && <ul className="fact-ledger">{manual.pipeline.facts!.map(fact=><li key={fact.id}>
        <span className={'badge '+(fact.status==='current'?'resolved':'active')}>{fact.status==='current'?'採用':'訂正前・除外'}</span> {fact.text}
      </li>)}</ul>}
      <p className="muted">AIの照合は正しさを保証しません。図解と実際の作業条件は管理者が確認します。</p>
    </details>}
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
    {!generating && (editing ? <ManualEditor key={manual.id + manual.updatedAt} manual={manual} busy={busy} save={save}/> :
      <ReviewApproval key={manual.id+manual.updatedAt} manual={manual} busy={busy} onEdit={()=>setEditing(true)} save={save}/>)}
  </section>;
}

function ReviewApproval({manual,busy,onEdit,save}: {manual:Manual; busy:boolean; onEdit:()=>void; save:(content:ManualContent,publish:boolean)=>void}) {
  const [checked,setChecked] = useState(false);
  return <div className="review-approval">
    <label className="check"><input type="checkbox" checked={checked} onChange={event=>setChecked(event.target.checked)}/>会話・作業条件・図解の一致を確認</label>
    <div className="actions"><button className="secondary" disabled={busy} onClick={onEdit}>編集する</button>
      <button disabled={busy || !checked || manual.status==='published' || Boolean(manual.pipeline && ['pending','blocked'].includes(manual.pipeline.verification))} onClick={()=>save(manual.content,true)}>✓ 確認済にする</button></div>
  </div>;
}
