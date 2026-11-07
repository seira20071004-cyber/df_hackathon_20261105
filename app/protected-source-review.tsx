'use client';
import {useState} from 'react';
import type {Manual} from '../lib/model';
export type SourceAction={action:'prepareSource'}|{action:'hideSource';index:number;start:number;end:number}|{action:'approveSource';confirmed:true};
export function ProtectedSourceReview({manual,busy,ai,onAction}:{manual:Manual;busy:boolean;ai:boolean;onAction:(action:SourceAction)=>void}){
 const [confirmed,setConfirmed]=useState(false),[selection,setSelection]=useState<{index:number;start:number;end:number}>();
 const source=manual.protectedSource,context=source?.context;
 const rows=context?[...context.sources,...(context.resolutionNote?[{role:'employee',text:context.resolutionNote}]:[])]:[];
 return <section className="panel flow source-review"><h3>生成前の機密情報確認</h3>
  {source?.error?<p role="alert">{source.error==='sensitive-input-blocked'?'送信禁止の情報を検出したため、Gemini への送信を停止しています。':'保護処理が完了していません。検査設定を確認して再試行してください。'}</p>:null}
  {context?<><p>{source?.inspection?.provider==='google-dlp'?'Google Sensitive Data Protection':'ローカル簡易検査'}で保護したコピーです。原文は変更されません。伏せたい箇所はテキストを選択してください。</p>
   <div className="messages">{rows.map((row,index)=>row.role==='system'?null:<div key={index} className={'bubble '+(row.role.startsWith('manager')?'own':'')}>
    <label><small>{row.role.startsWith('manager')?'管理者':'スタッフ'}{index===context.sources.length?' · 解決メモ':''}</small>
    <textarea readOnly aria-label={'保護済み発言 '+(index+1)} value={row.text} rows={Math.min(5,Math.ceil(row.text.length/44)+1)} onSelect={event=>{const el=event.currentTarget;setSelection(el.selectionEnd>el.selectionStart?{index,start:el.selectionStart,end:el.selectionEnd}:undefined);}}/></label></div>)}</div>
   <button className="secondary" disabled={busy||!selection} onClick={()=>selection&&onAction({action:'hideSource',...selection})}>選択箇所を機密情報として隠す</button>
   {source?.approvedAt&&<p className="notice">このコピーは確認済みです。再生成する場合も以下を確認してください。</p>}
   <label className="check"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>機密情報が残っていないことを確認しました</label>
   <button disabled={busy||!confirmed||!ai} onClick={()=>onAction({action:'approveSource',confirmed:true})}>マニュアルを作成</button>
   {!ai&&<p className="muted">生成サービスは未設定です。保護済みコピーは確認できます。</p>}
  </>:<button className="secondary" disabled={busy} onClick={()=>onAction({action:'prepareSource'})}>保護済みコピーを準備する</button>}
 </section>;
}
