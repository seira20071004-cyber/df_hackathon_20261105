'use client';
import {useEffect,useState} from 'react';
import type {Language,Manual,Question} from '../lib/model';
import type {ManualProgram} from '../lib/manual-graph';
export type ManualEvent=(event:'start'|'resolved'|'unresolved',runId:string,path:string[],text?:string,language?:Language)=>Promise<{question?:Question}>;
const words={ja:{start:'マニュアルを開始',next:'次へ',back:'前へ',question:'状況を選んでください',unknown:'分からない・管理者に確認',solved:'解決した',failed:'解決しない',contact:'管理者へ相談する',contactTitle:'管理者に確認しましょう',contactNote:'このマニュアルで確認できない操作は行わず、相談を続けてください。',details:'困っている内容',done:'解決したことを記録しました',preview:'プレビューです。利用結果は記録されません。',restart:'最初から見る',error:'操作を記録できませんでした。もう一度お試しください。'},
  en:{start:'Start guide',next:'Continue',back:'Back',question:'Choose your situation',unknown:'Not sure — ask a manager',solved:'Resolved',failed:'Not resolved',contact:'Ask your manager',contactTitle:'Check with your manager',contactNote:'Do not try actions that this guide cannot confirm. Continue in a conversation.',details:'What do you need help with?',done:'Your resolution has been recorded',preview:'Preview: results are not recorded.',restart:'Start again',error:'Could not record this action. Please try again.'},
  vi:{start:'Bắt đầu hướng dẫn',next:'Tiếp tục',back:'Quay lại',question:'Chọn tình huống của bạn',unknown:'Không rõ — hỏi quản lý',solved:'Đã giải quyết',failed:'Chưa giải quyết',contact:'Hỏi người quản lý',contactTitle:'Hãy xác nhận với quản lý',contactNote:'Không thực hiện thao tác mà tài liệu chưa xác nhận. Tiếp tục trao đổi với quản lý.',details:'Bạn đang gặp khó khăn gì?',done:'Đã ghi nhận việc giải quyết',preview:'Bản xem trước: không ghi nhận kết quả.',restart:'Xem lại từ đầu',error:'Không ghi nhận được thao tác. Vui lòng thử lại.'}};

export function ManualGuide({manual,program,language,onEvent,onBlock,contextText}:{manual:Manual;program:ManualProgram;language:Language;onEvent?:ManualEvent;onBlock?:(id:string)=>void;contextText?:string}){
  const text=words[language];
  const [run,setRun]=useState(()=>crypto.randomUUID()),[trail,setTrail]=useState<string[]>([]),[contact,setContact]=useState(false),[done,setDone]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [overview,setOverview]=useState(false);
  const [question,setQuestion]=useState(contextText||program.title);
  const current=program.blocks.find(block=>block.id===trail.at(-1));
  useEffect(()=>{if(current)onBlock?.(current.id);},[current?.id,onBlock]);
  function next(target:string|null){setError('');if(target===null){openContact();return;}setTrail(current=>[...current,target]);}
  function openContact(){
    const labels={ja:['最初の相談','参照したマニュアル','進んだ手順・選択','未解決の内容'],en:['Original question','Guide opened','Steps and choices followed','Still unresolved'],vi:['Câu hỏi ban đầu','Hướng dẫn đã xem','Các bước và lựa chọn đã đi qua','Vấn đề chưa giải quyết']}[language];
    const followed=trail.slice(0,-1).flatMap((id,index)=>{const block=program.blocks.find(row=>row.id===id);if(block?.type==='step')return [block.title];if(block?.type==='branch'){const choices=block.choices.filter(choice=>choice.nextBlockId===trail[index+1]);return choices.length===1?[block.question+' → '+choices[0].label]:[];}return [];});
    setQuestion([contextText?labels[0]+': '+contextText:'',labels[1]+': '+program.title,followed.length?labels[2]+': '+followed.join(' → '):'',labels[3]+': '].filter(Boolean).join('\n').slice(0,3000));setContact(true);
  }
  async function start(){setBusy(true);setError('');try{await onEvent?.('start',run,[],undefined,language);setTrail([program.startBlockId]);}catch{setError(text.error);}finally{setBusy(false);}}
  async function finish(event:'resolved'|'unresolved'){setBusy(true);setError('');try{await onEvent?.(event,run,trail,question,language);setDone(true);}catch{setError(text.error);}finally{setBusy(false);}}
  function reset(){setRun(crypto.randomUUID());setTrail([]);setContact(false);setDone(false);setError('');}
  const ordinal=current?.type==='step'?program.blocks.filter(block=>block.type==='step').findIndex(block=>block.id===current.id):-1;
  const stepPictures=ordinal>=0?(manual.figures??[]).filter(figure=>figure.afterStep===ordinal):[];
  return <section className="interactive-guide" aria-label="対話型マニュアル">
    {program.description&&<p className="guide-description">{program.description}</p>}
    <button className="secondary" type="button" aria-expanded={overview} onClick={()=>setOverview(!overview)}>{{ja:'全体を見る',en:'View overview',vi:'Xem tổng quan'}[language]}</button>
    {overview&&<ol className="guide-overview">{program.blocks.map(block=><li key={block.id} className={trail.includes(block.id)?'on-path':''}>{block.type==='step'?block.title:block.type==='branch'?block.question:block.content}</li>)}</ol>}
    {!onEvent&&<p className="muted guide-preview">{text.preview}</p>}
    {error&&<p role="alert" className="alert">{error}</p>}
    {done?<div className="guide-end" role="status"><span aria-hidden="true">✓</span><h3>{onEvent?text.done:text.preview}</h3><button className="secondary" onClick={reset}>{text.restart}</button></div>:
      contact?<div className="guide-contact flow"><h3>{text.contactTitle}</h3><p>{text.contactNote}</p>
        <label>{text.details}<textarea rows={3} maxLength={3000} value={question} onChange={event=>setQuestion(event.target.value)} disabled={busy}/></label>
        <div className="actions"><button disabled={busy||!question.trim()} onClick={()=>finish('unresolved')}>{text.contact}</button><button className="secondary" disabled={busy} onClick={()=>setContact(false)}>{text.back}</button></div>
      </div>:
      !current?<div className="flow guide-start">{(manual.figures??[]).filter(figure=>figure.afterStep===-1).map(figure=><figure key={figure.id}><img src={figure.url} alt={figure.caption}/>{figure.caption&&<figcaption>{figure.caption}</figcaption>}</figure>)}
        <button disabled={busy} onClick={start}>{text.start} →</button></div>:
      <div className={'guide-block flow guide-'+current.type} aria-live="polite">
        <div className="guide-progress"><span>{current.type.toUpperCase()}</span><small>{trail.length}</small></div>
        {current.type==='step'?<><h3>{current.title}</h3><p className="guide-action">{current.content}</p>{current.supplement&&<p className="notice">{current.supplement}</p>}
          {manual.imageLayout==='steps'&&manual.imageUrls[ordinal]&&<img className="guide-image" src={manual.imageUrls[ordinal]} alt={current.title}/>}
          {stepPictures.map(figure=><figure key={figure.id}><img className="guide-image" src={figure.url} alt={figure.caption}/>{figure.caption&&<figcaption>{figure.caption}</figcaption>}</figure>)}
          <button disabled={busy} onClick={()=>next(current.nextBlockId)}>{text.next} →</button></>:
        current.type==='branch'?<><h3>{current.question}</h3><p className="muted">{text.question}</p><div className="branch-choices">{current.choices.map(choice=><button className="secondary" key={choice.id} disabled={busy} onClick={()=>next(choice.nextBlockId)}>{choice.label} →</button>)}</div></>:
        current.type==='warning'?<><h3><span aria-hidden="true">!</span> {current.severity==='stop'?'STOP':'WARNING'}</h3><p className="guide-action">{current.content}</p>
          <button disabled={busy} onClick={()=>next(current.nextBlockId)}>{current.nextBlockId?text.next:text.contact}</button></>:
        <><h3>{current.content}</h3><div className="branch-choices"><button disabled={busy} onClick={()=>finish('resolved')}>✓ {text.solved}</button>
          <button className="secondary" disabled={busy} onClick={()=>next(current.failureNextBlockId)}>{text.failed} →</button></div></>}
        <div className="actions guide-help">{trail.length>1&&<button className="link" disabled={busy} onClick={()=>setTrail(current=>current.slice(0,-1))}>← {text.back}</button>}
          <button className="link" disabled={busy} onClick={openContact}>{text.unknown}</button></div>
      </div>}
  </section>;
}
