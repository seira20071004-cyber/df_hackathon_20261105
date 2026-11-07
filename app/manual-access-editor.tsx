'use client';
import {useState} from 'react';
import type {Manual,StaffRecipient} from '../lib/model';
import {manualAccess,defaultAccess,type ManualAccess} from '../lib/manual-access';
const descriptions={PUBLIC:'同じ会社・現場のスタッフに公開します。インターネット全体への公開ではありません。',INTERNAL:'同じ会社・現場で、指定した役割に限定します。',CONFIDENTIAL:'同じ会社・現場で、指定したスタッフだけが閲覧できます。',RESTRICTED:'管理者のみ確認できます。AIによる自動生成と公開を停止します。'};
export function ManualAccessEditor({manual,staff,busy,onSave}:{manual:Manual;staff:StaffRecipient[];busy:boolean;onSave:(access:ManualAccess)=>void}){
 const [policy,setPolicy]=useState<ManualAccess>(()=>manualAccess(manual)??structuredClone(defaultAccess));
 const recipients=staff.filter(person=>person.siteIds.includes(manual.siteId));
 const employee=policy.allowedRoles.includes('employee');
 return <details className="pipeline-report"><summary>機密レベル・閲覧できる人</summary>
  <fieldset disabled={busy}><legend>マニュアルの閲覧範囲</legend>
   <label>機密レベル<select value={policy.level} onChange={event=>setPolicy({...policy,level:event.target.value as ManualAccess['level']})}>
    {Object.keys(descriptions).map(level=><option key={level}>{level}</option>)}
   </select></label><p className="muted">{descriptions[policy.level]}</p>
   {policy.level!=='RESTRICTED'&&<label className="check"><input type="checkbox" checked={employee} onChange={event=>setPolicy({...policy,allowedRoles:event.target.checked?['manager','employee']:['manager']})}/>スタッフの閲覧を許可する</label>}
   {policy.level==='CONFIDENTIAL'&&employee&&<div><p>閲覧を許可するスタッフ</p>{recipients.map(person=><label className="recipient-option" key={person.id}>
    <input type="checkbox" checked={policy.allowedUserIds.includes(person.id)} onChange={event=>setPolicy({...policy,allowedUserIds:event.target.checked?[...policy.allowedUserIds,person.id]:policy.allowedUserIds.filter(id=>id!==person.id)})}/>{person.name}
   </label>)}{!policy.allowedUserIds.length&&<p className="notice">スタッフを1名以上指定するまで公開できません。</p>}</div>}
   <p className="muted">この現場の管理者は、確認・編集のために閲覧できます。設定を保存すると旧公開版を停止し、再承認が必要になります。</p>
   <button type="button" className="secondary" onClick={()=>onSave(policy)}>閲覧範囲を保存・非公開にする</button>
  </fieldset>
 </details>;
}
