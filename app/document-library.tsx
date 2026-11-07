'use client';
import {useEffect,useState} from 'react';
import {MAX_PDF_BYTES,type SourceDocument} from '../lib/document-types';
import type {Manual} from '../lib/model';

type Props={
 site:string;demo:boolean;busy:boolean;
 send:<T>(payload:object)=>Promise<T>;
 openManual:(manual:Manual)=>Promise<void>;
 download:(id:string)=>Promise<void>;
};
const labels:Record<string,string>={
 uploading:'保存中',upload_failed:'保存失敗',stored:'原本を保存済み',processing:'解析中',ready:'確認待ち',failed:'解析失敗',deleting:'削除中',
 'document-duplicate':'同じPDFが登録済みです。','invalid-pdf':'有効なPDFを選択してください。','active-pdf':'アクションや埋め込みファイルを含むPDFは登録できません。',
 'pdf-page-limit':'PDFは1〜10ページにしてください。','document-in-use':'関連マニュアルがあるため原本を削除できません。','document-ai-denied':'解析を許可してから実行してください。',
 'document-ai-unconfigured':'文書解析のクラウド設定を確認してください。','confidential-disabled':'この環境では高機密PDFのAI解析は許可されていません。',
 'demo-fixture-only':'デモではサンプルPDFのみ解析できます。','document-no-text':'検索に使えるテキストが得られませんでした。'
};
export function DocumentLibrary({site,demo,busy,send,openManual,download}:Props){
 const [visible,setVisible]=useState(false),[documents,setDocuments]=useState<SourceDocument[]>([]);
 const [file,setFile]=useState<File>(),[title,setTitle]=useState(''),[working,setWorking]=useState(false);
 const [classification,setClassification]=useState<SourceDocument['classification']>('internal'),[share,setShare]=useState(false);
 const [status,setStatus]=useState(''),[error,setError]=useState(''),[deleting,setDeleting]=useState('');
 const processing=documents.some(row=>row.state==='processing');
 async function refresh(){setDocuments(await send<SourceDocument[]>({action:'documentList'}));}
 useEffect(()=>{
  if(!visible||!processing)return;
  const timer=setInterval(()=>{if(!document.hidden)void refresh().catch(()=>undefined);},2500);
  return ()=>clearInterval(timer);
 },[visible,processing,site,send]);
 async function run(operation:()=>Promise<void>){
  setWorking(true);setError('');
  try{await operation();}catch(error){const code=error instanceof Error?error.message:'';setError(labels[code]??'操作を完了できませんでした。設定や権限を確認してください。');}
  finally{setWorking(false);setStatus('');}
 }
 function upload(){
  if(!file||!file.name.toLowerCase().endsWith('.pdf')||file.type&&file.type!=='application/pdf'||file.size>MAX_PDF_BYTES){setError('1.5 MB以下のPDFを選択してください。');return;}
  const selected=file;
  void run(async()=>{
   const data=await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onprogress=event=>setStatus('ファイルを読み込み中 '+Math.floor(event.loaded/selected.size*100)+'%');
    reader.onerror=()=>reject(new Error('read-failed'));
    reader.onload=()=>resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(selected);
   });
   setStatus('サーバーに送信・保存中');
   await send({action:'uploadPdf',filename:selected.name,data,classification,share});setFile(undefined);await refresh();
  });
 }
 const disabled=working||busy;
 return <section className="panel flow">
  <button type="button" className="secondary" aria-expanded={visible} disabled={disabled} onClick={()=>{setVisible(!visible);if(!visible)void run(refresh);}}>＋ マニュアルを追加</button>
  {visible&&<>
   <p>PDFを取り込むか、手順を直接作成できます。解決済みの相談からは相談詳細でマニュアルを作れます。</p>
   <label>直接作成するマニュアルのタイトル<input value={title} maxLength={120} onChange={event=>setTitle(event.target.value)}/></label>
   <button className="secondary" disabled={disabled||!title.trim()} onClick={()=>run(async()=>{await openManual(await send<Manual>({action:'directManual',title}));setTitle('');})}>空の下書きを作る</button>
   <label className="notice" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(!disabled)setFile(event.dataTransfer.files[0]);}}>PDFを選択、またはここにドロップ
    <input key={file?'selected':'empty'} type="file" accept="application/pdf,.pdf" disabled={disabled} onChange={event=>setFile(event.target.files?.[0])}/>
   </label>
   {file&&<p>{file.name} · {Math.ceil(file.size/1000)} KB</p>}
   <label>機密区分<select value={classification} onChange={event=>setClassification(event.target.value as SourceDocument['classification'])}><option value="general">一般</option><option value="internal">社内</option><option value="confidential">高機密</option></select></label>
   <label className="check"><input type="checkbox" checked={share&&classification!=='confidential'} disabled={classification==='confidential'||disabled} onChange={event=>setShare(event.target.checked)}/>承認後、閲覧権限を持つスタッフに原本全ページを共有できるようにする</label>
   <button disabled={disabled||!file} onClick={upload}>PDFを保存</button>
   {demo&&<a href="/sample-work-manual.pdf" download>試演用PDFをダウンロード</a>}
   {status&&<p role="status">{status}</p>}{error&&<p role="alert" className="alert">{error}</p>}
   {documents.map(row=><article key={row.id} className="panel flow">
    <strong>{row.filename} · {row.pageCount}ページ</strong><p>{labels[row.state]??row.state} {row.error&&' · '+(labels[row.error]??'詳細は設定を確認してください。')}</p>
    <p>{row.share?'承認済みの版から原本共有可能':'管理者のみ'}{row.estimatedLayoutUsd!==undefined&&' · Layout概算 $'+row.estimatedLayoutUsd.toFixed(2)}</p>
    <div className="actions">
    {['stored','failed','ready','processing'].includes(row.state)&&<button className="secondary" disabled={disabled} onClick={()=>run(()=>download(row.id))}>原本PDF</button>}
    {['stored','failed','ready'].includes(row.state)&&<button className="secondary" disabled={disabled} onClick={()=>run(async()=>{await send({action:'documentPermission',id:row.id,allowed:!row.allowed});await refresh();})}>{row.allowed?'AI解析の許可を取り消す':'このPDFのAI解析を許可'}</button>}
    {['stored','failed','processing'].includes(row.state)&&<button disabled={disabled||!row.allowed||(row.state==='processing'&&Date.now()-Date.parse(row.updatedAt)<300_000)} onClick={()=>run(async()=>{await send({action:'processPdf',id:row.id});await refresh();})}>{row.state==='stored'?'解析する':'解析を再試行'}</button>}
    {!row.linked?.length&&!['uploading','processing'].includes(row.state)&&<button className="link" disabled={disabled} onClick={()=>setDeleting(row.id)}>削除</button>}
    </div>
    {deleting===row.id&&<div className="notice"><p>原本と未公開の解析データを削除します。</p><button className="secondary" disabled={disabled} onClick={()=>run(async()=>{await send({action:'deletePdf',id:row.id});setDeleting('');await refresh();})}>削除を確定</button><button className="link" onClick={()=>setDeleting('')}>戻る</button></div>}
    {row.candidates?.map((candidate,index)=><details key={index}><summary>{candidate.program.title}</summary>
     <p>{candidate.type} · 適用条件 {candidate.conditions||'要確認'}</p>
     {candidate.exclusions&&<p>対象外 {candidate.exclusions}</p>}
     <ul>{candidate.program.blocks.map(block=><li key={block.id}>{block.type==='branch'?block.question:block.content}（{block.sourceMessageIds.map(id=>row.chunks?.find(chunk=>chunk.id===id)).filter(Boolean).map(chunk=>chunk!.pageStart+'ページ').join('、')}）</li>)}</ul>
     {candidate.questions.map((question,index)=><p key={index} className="notice">{question}</p>)}
     <button className="secondary" disabled={disabled} onClick={()=>run(async()=>{await openManual(await send<Manual>({action:'materializePdf',id:row.id,index,kind:'candidate'}));await refresh();})}>確認・編集する</button>
    </details>)}
    {!!row.chunks?.length&&<details><summary>検索用の原本抜粋 {row.chunks.length}件</summary>{row.chunks.map((chunk,index)=><div className="flow" key={chunk.id}><strong>{chunk.pageStart}–{chunk.pageEnd}ページ · {chunk.heading}{chunk.figure?' · 図あり':''}{chunk.table?' · 表あり':''}</strong><p>{chunk.text}</p><button className="secondary" disabled={disabled} onClick={()=>run(async()=>{await openManual(await send<Manual>({action:'materializePdf',id:row.id,index,kind:'chunk'}));await refresh();})}>抜粋を公開審査に送る</button></div>)}</details>}
   </article>)}
  </>}
 </section>;
}
