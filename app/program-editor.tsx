'use client';
import {useState,type FormEvent} from 'react';
import {blockText,graphIssues,programSchema,type ManualBlock,type ManualProgram} from '../lib/manual-graph';
import type {Manual} from '../lib/model';
import {ManualGuide} from './manual-guide';
import {categoryLabels,types,type ManualApplicability} from '../lib/adaptive';

export function ProgramEditor({manual,busy,onSave}:{manual:Manual;busy:boolean;onSave:(program:ManualProgram,publish:boolean,confirmed:boolean,applicability?:ManualApplicability)=>void}){
  const [program,setProgram]=useState<ManualProgram>(()=>structuredClone(manual.program!));
  const initial=manual.applicability??{category:manual.consultationType??'unknown',secondary:[],target:'',conditions:manual.sourceDocument?.conditions??'',exclusions:manual.sourceDocument?.exclusions??''};
  const [applicability,setApplicability]=useState<ManualApplicability>(initial);
  const applicabilityChanged=JSON.stringify(initial)!==JSON.stringify(applicability);
  function changeApplicability(update:Partial<ManualApplicability>){setApplicability(current=>({...current,...update}));setConfirmed(false);}
  const [confirmed,setConfirmed]=useState(false),[preview,setPreview]=useState(false),[type,setType]=useState<ManualBlock['type']>('step');
  const parsed=programSchema.safeParse(program),issues=parsed.success?graphIssues(program):['未入力の項目や文字数を確認してください'];
  const changed=JSON.stringify(program)!==JSON.stringify(manual.program)||applicabilityChanged;
  function change(id:string,update:Partial<ManualBlock>){setProgram(current=>({...current,blocks:current.blocks.map(block=>block.id===id?{...block,...update} as ManualBlock:block)}));setConfirmed(false);}
  function target(value:string|null,onChange:(next:string|null)=>void,currentId:string,label='次のブロック'){
    return <label>{label}<select value={value??''} disabled={busy} onChange={event=>onChange(event.target.value||null)}><option value="">管理者へ確認</option>
      {program.blocks.filter(block=>block.id!==currentId).map((block,index)=><option key={block.id} value={block.id}>{block.id} · {blockText(block).slice(0,35)||'未入力'}</option>)}</select></label>;
  }
  function add(){
    const id='block-'+crypto.randomUUID().slice(0,8),common={id,sourceMessageIds:[]};
    const block:ManualBlock=type==='step'?{...common,type,title:'',content:'',supplement:'',nextBlockId:null,restricted:false,authorizationSourceMessageIds:[]}:
      type==='branch'?{...common,type,question:'',choices:[{id:'yes',label:'はい',nextBlockId:null},{id:'no',label:'いいえ',nextBlockId:null}]}:
      type==='warning'?{...common,type,content:'',severity:'notice',nextBlockId:null}:{...common,type,content:'',successNextBlockId:null,failureNextBlockId:null};
    setProgram(current=>{const blocks=[...current.blocks];const last=blocks.at(-1);if(last?.type==='step'&&last.nextBlockId===null)blocks[blocks.length-1]={...last,nextBlockId:id};return {...current,blocks:[...blocks,block]};});setConfirmed(false);
  }
  function remove(id:string){setProgram(current=>{
    const blocks=current.blocks.filter(block=>block.id!==id).map(block=>block.type==='branch'?{...block,choices:block.choices.map(choice=>({...choice,nextBlockId:choice.nextBlockId===id?null:choice.nextBlockId}))}:
      block.type==='check'?{...block,failureNextBlockId:block.failureNextBlockId===id?null:block.failureNextBlockId}:{...block,nextBlockId:block.nextBlockId===id?null:block.nextBlockId});
    return {...current,startBlockId:current.startBlockId===id?blocks[0].id:current.startBlockId,blocks};
  });setConfirmed(false);}
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(issues.length)return;const publish=(event.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='publish';if(publish&&!confirmed)return;onSave(program,publish,confirmed,applicabilityChanged?applicability:undefined);}
  return <form className="flow program-editor" onSubmit={submit}>
    <h3>対話型マニュアルを編集</h3><p className="muted">ブロックの内容と遷移先を編集します。管理者による変更は元チャットとは別の確認済み情報として記録します。</p>
    <label>タイトル<input required maxLength={500} value={program.title} disabled={busy} onChange={event=>{setProgram(current=>({...current,title:event.target.value}));setConfirmed(false);}}/></label>
    <label>概要<textarea maxLength={700} rows={2} value={program.description} disabled={busy} onChange={event=>{setProgram(current=>({...current,description:event.target.value}));setConfirmed(false);}}/></label>
    <label>主カテゴリ<select value={applicability.category} disabled={busy} onChange={event=>{
      const category=event.target.value as ManualApplicability['category'];
      changeApplicability({category,secondary:applicability.secondary.filter(item=>item!==category)});
    }}>{types.map(item=><option value={item} key={item}>{categoryLabels[item]}</option>)}</select></label>
    <fieldset><legend>副カテゴリ</legend>{types.filter(item=>item!=='unknown'&&item!==applicability.category).map(item=><label className="check" key={item}>
      <input type="checkbox" checked={applicability.secondary.includes(item)} disabled={busy} onChange={event=>changeApplicability({secondary:event.target.checked?[...applicability.secondary,item].slice(0,3):applicability.secondary.filter(value=>value!==item)})}/>{categoryLabels[item]}</label>)}</fieldset>
    <label>対象物<input value={applicability.target} maxLength={240} disabled={busy} onChange={event=>changeApplicability({target:event.target.value})}/></label>
    <label>適用条件<textarea value={applicability.conditions} maxLength={500} disabled={busy} onChange={event=>changeApplicability({conditions:event.target.value})}/></label>
    <label>除外条件<textarea value={applicability.exclusions} maxLength={500} disabled={busy} onChange={event=>changeApplicability({exclusions:event.target.value})}/></label>
    <label>開始ブロック<select value={program.startBlockId} disabled={busy} onChange={event=>{setProgram(current=>({...current,startBlockId:event.target.value}));setConfirmed(false);}}>{program.blocks.map(block=><option key={block.id} value={block.id}>{block.id} · {blockText(block).slice(0,40)}</option>)}</select></label>
    {program.blocks.map((block,index)=><fieldset key={block.id} className={'program-edit-block '+block.type}><legend>{index+1} · {block.type.toUpperCase()} · {block.id}</legend>
      {block.type==='step'?<><label>短いタイトル<input required maxLength={500} value={block.title} disabled={busy} onChange={event=>change(block.id,{title:event.target.value})}/></label>
        <label>表示形式<select value={block.presentation??''} disabled={busy} onChange={event=>change(block.id,{presentation:(event.target.value||undefined) as typeof block.presentation})}><option value="">カテゴリに合わせる</option><option value="instruction">通常手順</option><option value="checklist">チェック項目</option><option value="explanation">説明</option><option value="approval">承認の確認</option></select></label>
        <label>操作説明<textarea required maxLength={500} value={block.content} disabled={busy} onChange={event=>change(block.id,{content:event.target.value})}/></label>
        <label>補足情報<textarea maxLength={500} value={block.supplement} disabled={busy} onChange={event=>change(block.id,{supplement:event.target.value})}/></label>
        <label className="check"><input type="checkbox" checked={block.restricted} disabled={busy} onChange={event=>change(block.id,{restricted:event.target.checked})}/>作業権限の確認が必要な操作</label>
        {target(block.nextBlockId,nextBlockId=>change(block.id,{nextBlockId}),block.id)}</>:
      block.type==='branch'?<><label>分岐の質問<textarea required maxLength={500} value={block.question} disabled={busy} onChange={event=>change(block.id,{question:event.target.value})}/></label>
        {block.choices.map((choice,i)=><div className="branch-edit-choice" key={choice.id}><label>選択肢 {i+1}<input required maxLength={500} value={choice.label} disabled={busy} onChange={event=>change(block.id,{choices:block.choices.map(item=>item.id===choice.id?{...item,label:event.target.value}:item)})}/></label>
          {target(choice.nextBlockId,nextBlockId=>change(block.id,{choices:block.choices.map(item=>item.id===choice.id?{...item,nextBlockId}:item)}),block.id,'この回答の遷移先')}
          <button type="button" className="link" disabled={busy||block.choices.length<=2} onClick={()=>change(block.id,{choices:block.choices.filter(item=>item.id!==choice.id)})}>選択肢を削除</button>
        </div>)}<button type="button" className="secondary" disabled={busy||block.choices.length>=4} onClick={()=>change(block.id,{choices:[...block.choices,{id:'choice-'+crypto.randomUUID().slice(0,8),label:'',nextBlockId:null}]})}>＋ 選択肢</button></>:
      block.type==='warning'?<><label>注意・禁止事項<textarea required maxLength={500} value={block.content} disabled={busy} onChange={event=>change(block.id,{content:event.target.value})}/></label>
        <label>種類<select value={block.severity} disabled={busy} onChange={event=>change(block.id,{severity:event.target.value as 'notice'|'stop',...(event.target.value==='stop'?{nextBlockId:null}:{})})}><option value="notice">注意・禁止</option><option value="stop">作業中止・管理者へ確認</option></select></label>
        {block.severity==='notice'&&target(block.nextBlockId,nextBlockId=>change(block.id,{nextBlockId}),block.id)}</>:
      <><label>解決を確認する基準<textarea required maxLength={500} value={block.content} disabled={busy} onChange={event=>change(block.id,{content:event.target.value})}/></label><p className="muted">「解決した」は完了として記録します。</p>
        {target(block.failureNextBlockId,failureNextBlockId=>change(block.id,{failureNextBlockId}),block.id,'解決しない場合の遷移先')}</>}
      <button type="button" className="link" disabled={busy||program.blocks.length<=1} onClick={()=>remove(block.id)}>ブロックを削除</button>
    </fieldset>)}
    <div className="actions"><select aria-label="追加するブロックの種類" value={type} disabled={busy} onChange={event=>setType(event.target.value as ManualBlock['type'])}><option value="step">STEP</option><option value="branch">BRANCH</option><option value="warning">WARNING</option><option value="check">CHECK</option></select>
      <button type="button" className="secondary" disabled={busy||program.blocks.length>=24} onClick={add}>＋ ブロックを追加</button><button type="button" className="secondary" disabled={Boolean(issues.length)} onClick={()=>setPreview(!preview)}>{preview?'プレビューを閉じる':'編集内容をプレビュー'}</button></div>
    {issues.length>0&&<div className="notice" role="alert"><strong>構造を確認してください</strong><ul>{issues.map((issue,index)=><li key={index}>{issue}</li>)}</ul></div>}
    {preview&&!issues.length&&<ManualGuide key={JSON.stringify(program)} manual={manual} program={program} language="ja"/>}
    <label className="check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/>元の会話・追加情報との一致、操作の安全性、必要な作業権限を管理者として確認しました</label>
    <div className="actions"><button className="secondary" value="draft" disabled={busy||Boolean(issues.length)}>未確認として保存</button>
      <button value="publish" disabled={busy||changed||!confirmed||Boolean(issues.length)||manual.reviewState==='awaiting_answers'||Boolean(manual.pipeline&&['pending','blocked'].includes(manual.pipeline.verification))}>承認して公開</button></div>
    {changed&&<p className="muted">変更を未確認として保存してから、その版を確認・承認してください。</p>}
  </form>;
}
