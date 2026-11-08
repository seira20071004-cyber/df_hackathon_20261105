'use client';

import { useEffect, useRef, useState } from 'react';
import { copy } from '../lib/copy';
import { languageNames, languages, type Language, type Manual, type ManualContent, type ManualEdits, type Question } from '../lib/model';
import { stairRange } from '../lib/diagrams';
import { RangeDiagram } from './range-diagram';
import { ManualEditor } from './manual-editor';
import {ManualGuide,type ManualEvent} from './manual-guide';
import {ProtectedSourceReview,type SourceAction} from './protected-source-review';
import {ProgramEditor} from './program-editor';
import {categoryLabels,type ManualApplicability} from '../lib/adaptive';
import {ManualAccessEditor} from './manual-access-editor';
import type {ManualAccess} from '../lib/manual-access';
import type {StaffRecipient} from '../lib/model';
import {paperProgram,type ManualProgram} from '../lib/manual-graph';
import {PendingDots} from './pending-dots';

export function hasManualContent(manual:Manual){
  return Boolean(manual.program||(manual.content.steps.length&&
    !(manual.sourceQuestionIds.length&&manual.content.title==='保護済み会話の確認待ち'&&
      manual.content.steps.length===1&&manual.content.steps[0]==='管理者による確認が必要')));
}
export function isGenerating(manual: Manual) {
  return Boolean(manual.generation && ['queued','analyzing','checking_gaps','writing','validating','illustrating'].includes(manual.generation.state) &&
    Date.now() - Date.parse(manual.generation.startedAt) < 300_000);
}

export function ManualView({manual, language, onEvent,contextText}: {manual: Manual; language: Language; onEvent?:ManualEvent;contextText?:string}) {
  const [displayLanguage,setDisplayLanguage] = useState(language);
  const documentRef=useRef<HTMLElement>(null);
  const [exporting,setExporting]=useState(false);
  const [exportError,setExportError]=useState('');
  useEffect(()=>setDisplayLanguage(language),[language]);
  const content = manual.translations[displayLanguage] ?? manual.content;
  const program=manual.programTranslations?.[displayLanguage]??manual.program;
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
    {exporting && <span role="status">作成中<PendingDots/></span>}{exportError && <p role="alert">{exportError}</p>}
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
    {program?<ManualGuide key={manual.id+manual.updatedAt+displayLanguage} manual={manual} program={program} language={displayLanguage} onEvent={onEvent} contextText={contextText}/>:<><section className="manual-procedure">
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
          <p className="procedure-text"><span aria-hidden="true">{range ? '✓' : String(index+1).padStart(2,'0')}</span>{step}</p>
          {figuresAt(index)}
        </li>)}
      </ol>
      {!range && !perStep && manual.imageUrls.map(url => <img className="procedure-image" key={url} src={url} alt={t('procedureImage')} loading="lazy"/>)}
    </section>
    {content.cautions.length > 0 && <section className="manual-cautions">
      <h3><span aria-hidden="true">!</span>{t('cautions')}</h3>
      <ul>{content.cautions.map((line,index) => <li key={index}>{line}</li>)}</ul>
    </section>}</>}
  </article></div>;
}

const errors: Record<string,string> = {
  'sensitive-input-blocked':'認証情報または送信禁止の機密情報を検出したため、Geminiには送信していません。元の会話を確認し、機密情報を除いた内容を手動編集してください。',
  'restricted-manual':'RESTRICTED のマニュアルはAI生成と公開を停止しています。',
  'secret-access-denied':'実行アカウントに対象シークレットの閲覧権限がありません。',
  'secret-unavailable':'シークレットを取得できません。実行環境の認証と接続を確認してください。',
  'secret-invalid':'シークレットの参照先・バージョン・内容を検証できません。',
  'secret-manager-required':'本番のAPIキーはSecret Managerで管理してください。',
  'privacy-unavailable':'機密情報の検査を完了できないため、AIへの送信と公開を停止しました。検査サービスの設定を確認してください。',
  'sensitive-output':'AIの出力に個人情報・秘密情報が含まれる可能性があるため、公開を保留しました。',
  'rate-limited':'AIの利用回数または同時実行数の上限に達しました。時間をおいて再生成してください。',
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
  ,'invalid-json':'Geminiの出力形式を検証できませんでした。再生成できます。'
  ,'generation-timeout':'生成が時間内に完了しませんでした。再生成できます。'
  ,'review-required':'品質検証または情報確認のため保留しています。下の確認事項を参照してください。'
};
export function ManualReview({manual, questions, busy, ai, regenerate, save,saveProgram,answer,changeState,stats,staff,saveAccess,sourceAction}: {
  manual: Manual; questions: Question[]; busy: boolean; ai: boolean;
  staff:StaffRecipient[];saveAccess:(access:ManualAccess)=>void;sourceAction:(action:SourceAction)=>void;
  regenerate: (imagesOnly:boolean) => void;
  save: (content:ManualContent,publish:boolean,edits?:ManualEdits) => void;
  saveProgram:(program:ManualProgram,publish:boolean,confirmed:boolean,applicability?:ManualApplicability)=>void;
  answer:(answers:{questionId:string;answer:string}[])=>void;
  changeState:(mode:'hold'|'unpublish'|'reject'|'archive')=>void;
  stats?:{uses:number;resolved:number;unresolved:number};
}) {
  const generating = isGenerating(manual);
  const state = manual.generation?.state;
  const [editing,setEditing] = useState(false);
  const sources = questions.filter(question => manual.sourceQuestionIds.includes(question.id));
  const summary=manual.program?paperProgram(manual.program):manual.content;
  const hasContent=hasManualContent(manual);
  const needsSource=manual.status==='draft'&&manual.generation?.error==='source-review-required';
  const stateLabel = needsSource?'生成前の確認待ち':generating ? state === 'illustrating' ? '任意の図解を生成中' : state==='validating' ? '品質と原文との一致を検証中' : state==='checking_gaps'?'重要な不足情報を確認中':state==='analyzing' ? '確定情報と訂正を抽出中' : 'ブロック構成を設計中' :
    manual.status==='published'?'確認済みのマニュアル':manual.reviewState==='awaiting_answers'?'管理者への追加質問があります':manual.reviewState==='rejected'?'却下したマニュアル':manual.reviewState==='archived'?'アーカイブ済み':manual.generation?.error==='safety-review'?'安全確認が必要なため保留':manual.reviewState==='held'?'保留中のマニュアル':state==='failed'?'生成内容の確認が必要です':'承認待ちのマニュアル';
  const activeStep=manual.reviewState==='awaiting_answers'?1:generating?(state==='analyzing'||state==='queued'?0:state==='checking_gaps'?1:state==='writing'?2:3):4;
  return <section className="panel flow review-panel">
    <div className="split"><div><div className="eyebrow">MANUAL STUDIO</div><h2>{stateLabel}{generating&&<PendingDots/>}</h2></div>
      <span className={'badge ' + (manual.status === 'published' ? 'resolved' : 'active')}>{manual.status === 'published' ? '確認済' : '未確認'}</span></div>
    {manual.status==='draft'&&!generating&&!['awaiting_answers','rejected','archived'].includes(manual.reviewState??'')&&manual.access?.level!=='RESTRICTED'&&sources.length>0&&(needsSource||state==='failed'?<ProtectedSourceReview key={manual.updatedAt} manual={manual} busy={busy} ai={ai} onAction={sourceAction}/>:<details className="pipeline-report"><summary>保護済み会話を確認・再生成</summary><ProtectedSourceReview key={manual.updatedAt} manual={manual} busy={busy} ai={ai} onAction={sourceAction}/></details>)}
    {needsSource&&<button type="button" className="secondary" disabled={busy} onClick={()=>changeState('reject')}>履歴のみ保存する（生成しない）</button>}
    {!needsSource&&<ManualAccessEditor key={manual.id+manual.updatedAt} manual={manual} staff={staff} busy={busy||generating} onSave={saveAccess}/>}
    {!needsSource&&<><div className="generation-track" role="status" aria-live="polite">
      {['会話を抽出','不足を確認','構成を設計','品質を検証','管理者が承認'].map((label,index) => <span key={label}
        className={index<activeStep?'progress-done':index===activeStep?'progress-active':''}>
        <b>{index + 1}</b>{label}
      </span>)}
    </div>
    {(state==='failed'||state==='held')&&manual.generation?.error&&<p className="notice">{errors[manual.generation.error]??errors['provider-error']}</p>}
    {manual.publishedSnapshot&&!manual.publicationSuppressed&&<p className="notice">編集中の変更は未公開です。スタッフには承認済みの版 {manual.publishedSnapshot.revision??1} を表示しています。</p>}
    {manual.security&&<div className="notice"><strong>機密情報の検査</strong><p>{manual.security.inspection.provider==='google-dlp'?'Google Sensitive Data Protection':'ローカル簡易検査（検出は完全ではありません）'} · {manual.security.inspection.available?'検査済み':'検査を完了できませんでした・公開保留'}</p>
      {manual.security.inspection.findings.length>0&&<p>要確認：{manual.security.inspection.findings.map(finding=>`${finding.type} (${finding.count})`).join('、')}。実際の値は検査記録に残しません。</p>}</div>}
    {manual.generation && !generating && ['queued','analyzing','checking_gaps','writing','validating','illustrating'].includes(state ?? '') &&
      <p className="notice">生成が中断された可能性があります。再生成して続行できます。</p>}
    {manual.reviewState==='awaiting_answers'&&manual.clarification&&<ClarificationForm key={'clarification-'+manual.id+manual.updatedAt} manual={manual} busy={busy} ai={ai} onAnswer={answer}/>}
    {manual.applicability&&<section className="notice flow"><strong>{categoryLabels[manual.applicability.category]}</strong>{manual.applicability.target&&<p>対象：{manual.applicability.target}</p>}{manual.applicability.conditions&&<p>適用条件：{manual.applicability.conditions}</p>}{manual.applicability.exclusions&&<p>除外条件：{manual.applicability.exclusions}</p>}</section>}
    {manual.knowledgeSuggestion&&<p className="notice">ナレッジ整理の候補：{({new_manual:'新規作成',update_existing:'既存版の更新を検討',duplicate:'重複の可能性',skip:'作成を見送る候補'}[manual.knowledgeSuggestion.decision])}。管理者が内容を確認してください。</p>}
    {!!manual.feedback?.length&&<details className="pipeline-report"><summary>スタッフの報告 {manual.feedback.length}件</summary><ul>{manual.feedback.slice(-10).map((item,index)=><li key={index}>{({outdated:'情報が古い',incorrect:'内容が違う',unhelpful:'役に立たなかった'}[item.reason])} · {new Date(item.at).toLocaleDateString('ja-JP')}</li>)}</ul></details>}
    <div className="manual-metrics"><span>版 {manual.revision??1}</span><span>利用 {stats?.uses??0}</span><span>解決 {stats?.resolved??0}</span><span>未解決 {stats?.unresolved??0}</span></div>
    {manual.quality&&<details className="pipeline-report"><summary>品質検証・構造チェック</summary>
      {manual.quality.report&&<p>正確性 {manual.quality.report.accurate?'✓':'要確認'} · 完全性 {manual.quality.report.complete?'✓':'要確認'} · 明瞭性 {manual.quality.report.clear?'✓':'要確認'} · 安全性 {manual.quality.report.safe?'✓':'要確認'}</p>}
      <ul>{manual.quality.issues.map((issue,index)=><li key={index}>{issue}</li>)}</ul><p className="muted">自動修正 {manual.quality.repairs} / 2回。最終公開には管理者の確認が必要です。</p>
    </details>}
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

      {hasContent&&manual.kind!=='faq'&&<button className="secondary" disabled={busy || generating || !ai} onClick={() => regenerate(true)}>▧ 図解を再生成</button>}
      {(hasContent||manual.protectedSource?.approvedAt)&&<button className="link" disabled={generating} onClick={() => setEditing(!editing)} aria-expanded={editing}>{editing ? '編集を閉じる' : '編集する'}</button>}
      {manual.status==='published'?<button className="secondary" disabled={busy} onClick={()=>changeState('unpublish')}>非公開にする</button>:
        <button className="secondary" disabled={busy||manual.reviewState==='held'} onClick={()=>changeState('hold')}>保留にする</button>}
      {manual.reviewState!=='archived'&&<button className="link" disabled={busy||generating} onClick={()=>changeState('archive')}>アーカイブする</button>}
      {manual.status!=='published'&&<button className="secondary" disabled={busy||generating||manual.reviewState==='rejected'} onClick={()=>changeState('reject')}>却下する</button>}
    </div>
    <div className="manual-review-columns">
      <section className="review-conversation">
        <h3 className="review-column-heading"><span aria-hidden="true">◌</span>元の会話</h3>
        <div className="review-conversation-body">{sources.length ? sources.map(question => <div className="flow" key={question.id}>
          <article className="source-message employee"><span className="source-avatar" aria-hidden="true">人</span><div><strong>スタッフ</strong>
            <p>{question.japaneseText || question.originalText}</p></div></article>
          {question.messages.map(message=><article key={message.id} className={'source-message '+message.role}>
            <span className="source-avatar" aria-hidden="true">{message.role==='manager' ? '管' : '人'}</span><div>
              <strong>{message.role==='manager' ? '管理者' : 'スタッフ'}</strong><p>{message.role==='manager' ? message.originalText : message.translatedText || message.originalText}</p>
            </div>
          </article>)}
        </div>) : <p className="muted">参照した会話がありません。</p>}
          {Boolean(manual.clarification?.answers.length)&&<div className="supplement-sources"><h4>管理者の追加情報（元のチャットとは別に保存）</h4>
            {manual.clarification!.answers.map(answer=><article className="source-message manager" key={answer.id}><div>
              <strong>{answer.question}</strong><p>{answer.answer}</p><small>{new Date(answer.createdAt).toLocaleString('ja-JP')}</small></div></article>)}
          </div>}
        </div>
      </section>
      <section className="review-preview">
        <h3 className="review-column-heading"><span aria-hidden="true">▤</span>{manual.kind==='faq'?'FAQのプレビュー':'マニュアルのプレビュー'}</h3>
        <div className="review-preview-body flow">
          {generating?<p role="status">会話からマニュアルを作成中<PendingDots/></p>:!hasContent?
            <p className="muted">{manual.reviewState==='awaiting_answers'?'追加質問への回答を待っています。':'マニュアル本文はまだありません。保留理由と元の会話を確認してください。'}</p>:
            <article className="manual-document flow">
              <h4>{summary.title}</h4>
              {summary.purpose&&summary.purpose!==summary.title&&<div>{manual.kind!=='faq'&&manual.consultationType&&<h4>{manual.consultationType==='troubleshooting'?'発生する問題':'作業目的'}</h4>}<p>{summary.purpose}</p></div>}
              <section aria-label={manual.kind==='faq'?'回答':'対処法の要約'}>
                <h4>{manual.kind==='faq'?'回答':'対処法'}</h4>
                {manual.kind==='faq'?manual.content.steps.map((step,index)=><p key={index}>{step}</p>):<ol className="manual-summary-steps">{summary.steps.map((step,index)=><li key={index}>{step}</li>)}</ol>}
              </section>
              {summary.cautions.length>0&&<section><h4>注意事項</h4><ul>{summary.cautions.map((caution,index)=><li key={index}>{caution}</li>)}</ul></section>}
            </article>}
          {!generating&&hasContent&&<details><summary>マニュアルを操作・ダウンロード</summary><ManualView manual={manual} language="ja"/></details>}
        </div>
      </section>
    </div>
    {!generating && (editing ? manual.program?<ProgramEditor key={'editor-'+manual.id+manual.updatedAt} manual={manual} busy={busy} onSave={saveProgram}/>:<ManualEditor key={'legacy-editor-'+manual.id + manual.updatedAt} manual={manual} busy={busy} save={save}/> :
      hasContent&&<ReviewApproval key={'approval-'+manual.id+manual.updatedAt} manual={manual} busy={busy} onEdit={()=>setEditing(true)} save={save} saveProgram={saveProgram}/>)}
    </>}
    {Boolean(manual.audit?.length)&&<details className="pipeline-report"><summary>編集・承認履歴</summary><ul>{[...manual.audit!].reverse().map((entry,index)=><li key={index}>v{entry.revision} · {new Date(entry.at).toLocaleString('ja-JP')} · {entry.actor} · {entry.action} · {entry.changes.join('、')}</li>)}</ul></details>}
  </section>;
}

function ReviewApproval({manual,busy,onEdit,save,saveProgram}: {manual:Manual; busy:boolean; onEdit:()=>void; save:(content:ManualContent,publish:boolean)=>void;saveProgram:(program:ManualProgram,publish:boolean,confirmed:boolean,applicability?:ManualApplicability)=>void}) {
  const [checked,setChecked] = useState(false);
  return <div className="review-approval">
    <label className="check"><input type="checkbox" checked={checked} onChange={event=>setChecked(event.target.checked)}/>会話・追加情報との一致、作業条件、必要な作業権限を確認</label>
    <div className="actions"><button className="secondary" disabled={busy} onClick={onEdit}>編集する</button>
      <button disabled={busy || !checked || manual.status==='published' || manual.reviewState==='awaiting_answers' || Boolean(manual.pipeline && ['pending','blocked'].includes(manual.pipeline.verification))} onClick={()=>manual.program?saveProgram(manual.program,true,true):save(manual.content,true)}>✓ 確認済にする</button></div>
  </div>;
}

function ClarificationForm({manual,busy,ai,onAnswer}:{manual:Manual;busy:boolean;ai:boolean;onAnswer:(answers:{questionId:string;answer:string}[])=>void}){
  const [values,setValues]=useState<Record<string,string>>({});const pending=manual.clarification!.questions;
  return <form className="flow clarification-form" onSubmit={event=>{event.preventDefault();onAnswer(pending.map(question=>({questionId:question.id,answer:values[question.id]?.trim()??''})));}}>
    <div className="split"><h3>Geminiからの追加質問</h3><span className="badge active">{manual.clarification!.round} / 3回</span></div>
    <p>マニュアルの正確性・安全性・再現性のため、次の点を確認してください。回答後に再分析します。</p>
    {pending.map(question=><label key={question.id}>{question.question}<small className="muted">{question.reason}</small><textarea required rows={3} maxLength={3000} disabled={busy||!ai} value={values[question.id]??''} onChange={event=>setValues(current=>({...current,[question.id]:event.target.value}))}/></label>)}
    <button disabled={busy||!ai||pending.some(question=>!values[question.id]?.trim())}>回答を保存して生成を続ける</button>
  </form>;
}
