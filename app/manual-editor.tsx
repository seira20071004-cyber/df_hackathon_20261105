'use client';

import {useEffect,useRef,useState,type FormEvent,type PointerEvent} from 'react';
import type {Manual,ManualContent,ManualEdits,ManualFigure} from '../lib/model';

type Row={id:string;text:string;source:number};
type Figure=Omit<ManualFigure,'afterStep'> & {anchor:string};

async function readPicture(file:File) {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>10_000_000) throw new Error('JPEG・PNG・WebPの画像（10MB以下）を選んでください。');
  const url=URL.createObjectURL(file);
  try {
    const image=new Image();image.src=url;await image.decode();
    if(image.naturalWidth*image.naturalHeight>16_000_000)throw new Error('画像が大きすぎます。1600万画素以下の画像を選んでください。');
    const scale=Math.min(1,1000/image.naturalWidth,800/image.naturalHeight);
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('画像を読み込めませんでした。');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of [.85,.7,.5,.3]) {const data=canvas.toDataURL('image/jpeg',quality);if(data.length<140_000)return data;}
    throw new Error('画像を圧縮しきれませんでした。小さな画像を選んでください。');
  } finally {URL.revokeObjectURL(url);}
}

export function ManualEditor({manual,busy,save}:{manual:Manual;busy:boolean;save:(content:ManualContent,publish:boolean,edits?:ManualEdits)=>void}) {
  const [title,setTitle]=useState(manual.content.title);
  const [rows,setRows]=useState<Row[]>(()=>manual.content.steps.map((text,source)=>({id:'source-'+source,text,source})));
  const [figures,setFigures]=useState<Figure[]>(()=> (manual.figures ?? []).map(figure=>({...figure,anchor:figure.afterStep<0?'start':'source-'+figure.afterStep})));
  const [cautions,setCautions]=useState(manual.content.cautions);
  const [confirmed,setConfirmed]=useState(false);
  const [insertion,setInsertion]=useState('start');
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState('');
  const [dragging,setDragging]=useState('');
  const [announcement,setAnnouncement]=useState('');
  const rowRef=useRef(rows);rowRef.current=rows;
  const hold=useRef<{timer:ReturnType<typeof setTimeout>;id:string;active:boolean;x:number;y:number}|null>(null);
  useEffect(()=>()=>{if(hold.current)clearTimeout(hold.current.timer);},[]);
  const steps=rows.map(row=>row.text);
  const changedSteps=JSON.stringify(steps)!==JSON.stringify(manual.content.steps);
  const disabled=busy||uploading;
  const changedContent=changedSteps||title!==manual.content.title||JSON.stringify(cautions)!==JSON.stringify(manual.content.cautions)||JSON.stringify(figures.map(figure=>({id:figure.id,afterStep:figure.anchor==='start'?-1:rows.findIndex(row=>row.id===figure.anchor),url:figure.url,caption:figure.caption})))!==JSON.stringify(manual.figures??[]);
  const canPublish=!disabled && confirmed && !changedContent && !Boolean(manual.pipeline && ['pending','blocked'].includes(manual.pipeline.verification));
  function move(id:string,target:string) {
    const current=rowRef.current;const from=current.findIndex(row=>row.id===id);const to=current.findIndex(row=>row.id===target);
    if(from<0||to<0||from===to)return;
    const next=[...current];next.splice(to,0,next.splice(from,1)[0]);rowRef.current=next;setRows(next);setConfirmed(false);
    setAnnouncement(`STEP ${from+1}を${to+1}番目へ移動しました`);
  }
  function stop() {if(hold.current)clearTimeout(hold.current.timer);hold.current=null;setDragging('');}
  function pointerDown(event:PointerEvent<HTMLButtonElement>,id:string) {
    if(disabled || event.button!==0)return;
    const element=event.currentTarget;const pointerId=event.pointerId;
    element.setPointerCapture(pointerId);
    hold.current={id,active:false,x:event.clientX,y:event.clientY,timer:setTimeout(()=>{
      if(!hold.current || !element.isConnected)return;
      hold.current.active=true;setDragging(id);element.setPointerCapture(pointerId);setAnnouncement('移動中です。入れ替えるSTEPまで動かしてください。');
    },400)};
  }
  function pointerMove(event:PointerEvent<HTMLButtonElement>) {
    const held=hold.current;if(!held)return;
    if(!held.active) {if(Math.hypot(event.clientX-held.x,event.clientY-held.y)>10)stop();return;}
    event.preventDefault();
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-step-id]');
    if(target?.dataset.stepId)move(held.id,target.dataset.stepId);
    if(event.clientY<100)window.scrollBy(0,-16);else if(event.clientY>innerHeight-100)window.scrollBy(0,16);
  }
  async function upload(file:File|undefined) {
    if(!file)return;setUploading(true);setError('');
    try {const url=await readPicture(file);setFigures(current=>[...current,{id:crypto.randomUUID(),anchor:insertion,url,caption:''}]);setConfirmed(false);}
    catch(caught){setError(caught instanceof Error?caught.message:'画像を読み込めませんでした。');}
    finally{setUploading(false);}
  }
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(disabled)return;
    const publish=(event.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='publish';if(publish&&!canPublish)return;
    save({...manual.content,title:title.trim(),steps:rows.map(row=>row.text.trim()),cautions:cautions.map(line=>line.trim()).filter(Boolean)},publish,
      {stepSources:rows.map(row=>row.source),figures:figures.map(({anchor,...figure})=>({...figure,afterStep:anchor==='start'?-1:rows.findIndex(row=>row.id===anchor)}))});
  }
  function pictureList(anchor:string) {
    return figures.filter(figure=>figure.anchor===anchor).map(figure=><figure className="edit-figure" key={figure.id}>
      <img src={figure.url} alt={figure.caption || '挿入する図'}/>
      <label>図の説明<input maxLength={200} value={figure.caption} disabled={disabled} onChange={event=>{setFigures(current=>current.map(item=>item.id===figure.id?{...item,caption:event.target.value}:item));setConfirmed(false);}}/></label>
      <label>図の位置<select value={figure.anchor} disabled={disabled} onChange={event=>{setFigures(current=>current.map(item=>item.id===figure.id?{...item,anchor:event.target.value}:item));setConfirmed(false);}}>
        <option value="start">対処法の先頭</option>{rows.map((row,index)=><option key={row.id} value={row.id}>STEP {index+1}の後</option>)}
      </select></label>
      <button className="link" type="button" disabled={disabled} onClick={()=>{setFigures(current=>current.filter(item=>item.id!==figure.id));setConfirmed(false);}}>図を削除</button>
    </figure>);
  }
  return <form className="flow manual-editor" onSubmit={submit}>
    <div className="split"><h3>内容を整える</h3><span className="muted">編集内容を保存してプレビューに反映</span></div>
    <label>質問内容<input required maxLength={250} value={title} disabled={disabled} onChange={event=>{setTitle(event.target.value);setConfirmed(false);}}/></label>
    <div className="figure-insert">
      <h4>図を挿入</h4><p className="muted">JPEG・PNG・WebPを選べます。図はSTEPと一緒に移動し、挿入後も位置を変更できます。</p>
      <label>挿入位置<select value={rows.some(row=>row.id===insertion)?insertion:'start'} disabled={disabled} onChange={event=>setInsertion(event.target.value)}>
        <option value="start">対処法の先頭</option>{rows.map((row,index)=><option key={row.id} value={row.id}>STEP {index+1}の後</option>)}
      </select></label>
      <label className="file-picker">{uploading?'読み込み中…':'＋ 画像を選択'}<input aria-label="挿入する画像" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled||figures.length>=12}
        onChange={event=>{upload(event.target.files?.[0]);event.target.value='';}}/></label>
      {error && <p role="alert" className="notice">{error}</p>}
    </div>
    <fieldset><legend>対処法</legend><p className="muted" id="step-drag-help">左の「⠿」を長押しして移動すると、STEPを入れ替えられます。上下ボタン、または「⠿」にフォーカスして矢印キーでも移動できます。</p>
      <p role="status" aria-live="polite" className="muted">{announcement}</p>{pictureList('start')}
      {rows.map((row,index)=><div className={'edit-step sortable-step'+(dragging===row.id?' dragging':'')} data-step-id={row.id} key={row.id}>
        <div className="step-block-heading"><button type="button" className="drag-handle" aria-label={`STEP ${index+1}を移動`} aria-describedby="step-drag-help" disabled={disabled}
          onPointerDown={event=>pointerDown(event,row.id)} onPointerMove={pointerMove} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
          onContextMenu={event=>event.preventDefault()} onKeyDown={event=>{
            if(event.key==='ArrowUp'&&index>0){event.preventDefault();move(row.id,rows[index-1].id);}
            if(event.key==='ArrowDown'&&index<rows.length-1){event.preventDefault();move(row.id,rows[index+1].id);}
          }}>⠿</button><strong>STEP {String(index+1).padStart(2,'0')}</strong><span className="muted">長押しして移動</span></div>
        <label>対処法の文章<textarea rows={2} required maxLength={500} value={row.text} disabled={disabled} onChange={event=>{setRows(current=>current.map(item=>item.id===row.id?{...item,text:event.target.value}:item));setConfirmed(false);}}/></label>
        {manual.imageLayout==='steps' && row.text===manual.content.steps[row.source] && manual.imageUrls[row.source] && <img className="edit-generated-image" src={manual.imageUrls[row.source]} alt="このSTEPの図"/>}
        {manual.evidence?.steps[row.source]?.length && row.text===manual.content.steps[row.source] ? <details className="step-evidence"><summary>根拠となる回答</summary>
          {manual.evidence.steps[row.source].map((source,i)=><blockquote key={i}>{source.quote}</blockquote>)}</details>:null}
        {pictureList(row.id)}
        <div className="actions"><button type="button" className="link" disabled={index===0||disabled} onClick={()=>move(row.id,rows[index-1].id)}>↑ 上へ</button>
          <button type="button" className="link" disabled={index===rows.length-1||disabled} onClick={()=>move(row.id,rows[index+1].id)}>↓ 下へ</button>
          <button type="button" className="link" disabled={rows.length===1||disabled} onClick={()=>{stop();setRows(current=>current.filter(item=>item.id!==row.id));setFigures(current=>current.filter(figure=>figure.anchor!==row.id));if(insertion===row.id)setInsertion('start');setConfirmed(false);}}>STEPを削除</button></div>
      </div>)}
      <button className="secondary" type="button" disabled={rows.length>=12||disabled} onClick={()=>{setRows(current=>[...current,{id:crypto.randomUUID(),text:'',source:-1}]);setConfirmed(false);}}>＋ 手順を追加</button>
    </fieldset>
    <label>注意事項 <span className="muted">会話に注意がある場合のみ記入</span><textarea rows={2} maxLength={4000} value={cautions.join('\n')} disabled={disabled}
      onChange={event=>{setCautions(event.target.value?event.target.value.split('\n'):[]);setConfirmed(false);}}/></label>
    {changedSteps && <p className="notice">変更を保存してから、文章と図の対応を確認してください。並べ替えだけの場合は図も一緒に移動します。文章を書き換えたSTEPの生成図は外れます。</p>}
    <label className="check"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>会話との一致、作業条件、文章と図の対応を確認しました</label>
    <div className="actions"><button className="secondary" disabled={disabled} value="draft">未確認として保存</button><button disabled={!canPublish} value="publish">✓ 確認済にする</button></div>
  </form>;
}
