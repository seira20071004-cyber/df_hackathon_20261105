'use client';
import {useState} from 'react';
import {mayViewManual} from '../lib/manual-access';
import type {Language,Manual,ManualDelivery,StaffRecipient} from '../lib/model';

export function ManualSend({manual,staff,deliveries,busy,onSend}:{manual:Manual;staff:StaffRecipient[];deliveries:ManualDelivery[];busy:boolean;onSend:(ids:string[])=>Promise<void>}) {
  const [chosen,setChosen]=useState<string[]>([]);
  const [sending,setSending]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const recipients=staff.filter(person=>mayViewManual({...person,role:'employee',organizationId:manual.organizationId,preferredLanguage:'ja'},manual));
  const history=deliveries.filter(row=>row.manualId===manual.id && row.version===manual.updatedAt);
  async function submit() {
    setSending(true);setNotice('');setError('');
    try {await onSend(chosen);setNotice(`${chosen.length}名のスタッフへ送信しました。`);setChosen([]);}
    catch(caught){const code=caught instanceof Error?caught.message:'';setError(code==='stale-manual'?'マニュアルが更新されました。画面を更新してから送信してください。':code==='manual-not-published'?'確認済のマニュアルだけ送信できます。':code==='invalid-recipient'?'送信先のスタッフや現場が変更されています。画面を更新してください。':'送信できませんでした。もう一度お試しください。');}
    finally{setSending(false);}
  }
  return <section className="panel flow manual-send" aria-labelledby="manual-send-heading">
    <div><h2 id="manual-send-heading">スタッフへ送信</h2><p className="muted">この確認済マニュアルを、選んだスタッフのホームとマニュアル一覧へ届けます。</p></div>
    <fieldset disabled={busy||sending}><legend>送信先のスタッフ</legend>
      {recipients.length?recipients.map(person=><label className="recipient-option" key={person.id}>
        <input type="checkbox" checked={chosen.includes(person.id)} onChange={event=>setChosen(current=>event.target.checked?[...current,person.id]:current.filter(id=>id!==person.id))}/>
        <span>{person.name}</span><small>{history.some(row=>row.employeeId===person.id)?'送信済':''}</small>
      </label>):<p className="muted">この現場の送信先スタッフがいません。</p>}
    </fieldset>
    <div className="actions"><button type="button" disabled={busy||sending||!chosen.length} onClick={submit}>{sending?'送信中…':`選択した${chosen.length}名へ送信`}</button></div>
    {notice&&<p className="notice" role="status">{notice}</p>}{error&&<p className="alert" role="alert">{error}</p>}
    {history.length>0&&<div className="delivery-history"><h3>この版の送信状況</h3>{history.map(delivery=><div className="split" key={delivery.id}>
      <span>{recipients.find(person=>person.id===delivery.employeeId)?.name || 'スタッフ'}<small> · {new Date(delivery.createdAt).toLocaleString('ja-JP')}</small></span>
      <span className={'badge '+(delivery.readAt?'resolved':'active')}>{delivery.readAt?'既読':'未読'}</span>
    </div>)}</div>}
  </section>;
}

const inboxCopy={ja:{title:'届いたマニュアル',from:'管理者から',unread:'未読',read:'既読'},
  en:{title:'Guides from your manager',from:'From your manager',unread:'New',read:'Read'},
  vi:{title:'Tài liệu từ quản lý',from:'Từ quản lý',unread:'Chưa đọc',read:'Đã đọc'}};
export function ManualInbox({deliveries,manuals,language,busy,onOpen}:{deliveries:ManualDelivery[];manuals:Manual[];language:Language;busy:boolean;onOpen:(manual:Manual)=>void}) {
  const text=inboxCopy[language];
  if(!deliveries.length)return <section className="panel flow manual-inbox"><h2>{text.title}</h2>
    <p className="empty">{{ja:'届いたマニュアルはまだありません。',en:'No guides received yet.',vi:'Chưa nhận được tài liệu nào.'}[language]}</p>
  </section>;
  return <section className="panel flow manual-inbox"><div className="split"><h2>{text.title}</h2>
    <span className="badge active">{deliveries.filter(row=>!row.readAt).length} {text.unread}</span></div>
    <div className="rows">{deliveries.map(delivery=>{const manual=manuals.find(row=>row.id===delivery.manualId);if(!manual)return null;
      return <button className="row" disabled={busy} key={delivery.id} onClick={()=>onOpen(manual)}>
        <span className="tile">▤</span><span className="row-text"><strong>{(manual.translations[language] ?? manual.content).title}</strong>
          <small>{text.from} · {new Date(delivery.createdAt).toLocaleDateString(language)}</small></span>
        <span className={'badge '+(delivery.readAt?'resolved':'active')}>{delivery.readAt?text.read:text.unread}</span><span>›</span>
      </button>;
    })}</div>
  </section>;
}
