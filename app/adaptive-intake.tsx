'use client';
import {useState} from 'react';
import type {AdaptiveDetails} from '../lib/adaptive';
import type {Language} from '../lib/model';
const labels={
 ja:{clarify:'もう少し教えてください',answer:'回答を入力',continue:'回答して探す',safety:'安全を先に確認してください',safe:'通常の作業手順の案内を停止しました。現場の安全手順に従い、指定の連絡先または管理者に直接連絡してください。',handoff:'適用できる手順を確認できませんでした。管理者に相談できます。',contact:'連絡先'},
 en:{clarify:'Tell us a little more',answer:'Type an answer',continue:'Continue search',safety:'Check safety first',safe:'Routine guidance has been paused. Follow your workplace safety procedure and contact the designated person or your manager directly.',handoff:'We could not confirm a matching procedure. You can ask a manager.',contact:'Contact'},
 vi:{clarify:'Hãy cho biết thêm',answer:'Nhập câu trả lời',continue:'Tiếp tục tìm',safety:'Kiểm tra an toàn trước',safe:'Đã tạm dừng hướng dẫn thông thường. Hãy làm theo quy trình an toàn tại nơi làm việc và liên hệ trực tiếp với người phụ trách.',handoff:'Chưa xác nhận được hướng dẫn phù hợp. Bạn có thể hỏi quản lý.',contact:'Liên hệ'}
};
export function AdaptiveIntake({details,language,busy,round,onAnswer}:{details:AdaptiveDetails;language:Language;busy:boolean;round:number;onAnswer:(field:string,text:string)=>void}){
 const text=labels[language],[value,setValue]=useState('');
 if(details.mode==='safety')return <section className="panel flow safety-card" role="alert"><h2>{text.safety}</h2><p>{text.safe}</p>{details.safety?.instructions&&<p>{details.safety.instructions}</p>}{details.safety?.contact&&<p><strong>{text.contact}：</strong>{details.safety.contact}</p>}</section>;
 if(details.mode==='handoff')return <p className="notice">{text.handoff}</p>;
 const question=details.question;if(details.mode!=='clarify'||!question)return null;
 return <section className="panel flow intake-card"><span className="eyebrow">AI · {round}/3</span><h2>{text.clarify}</h2><p>{question.text}</p>
  {question.options.map((option,index)=><button className="secondary" key={index} disabled={busy} onClick={()=>onAnswer(question.field,option)}>{option}</button>)}
  <label>{text.answer}<input value={value} onChange={event=>setValue(event.target.value)} maxLength={500} disabled={busy}/></label>
  <button disabled={busy||!value.trim()} onClick={()=>onAnswer(question.field,value.trim())}>{text.continue}</button>
 </section>;
}
