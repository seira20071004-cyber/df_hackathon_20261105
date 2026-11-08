import type {Language} from '../lib/model';

export type ConsultationStage='urgency'|'category'|'urgent'|'people'|'rules'|'work';
const hr={email:'hr@example.com',phone:'03-0000-0000'};
const labels={
  ja:{urgency:'緊急度を選択',category:'カテゴリを選択',urgent:'緊急',normal:'通常',urgentHelp:'けが・事故など、すぐに対応が必要な場合',normalHelp:'今すぐの対応が必要ない場合',people:'人間関係',rules:'ルール・制度',work:'業務',peopleHelp:'人間関係・ハラスメント・相談窓口',rulesHelp:'休暇・勤務・給与などの社内ルール',workHelp:'機械の使い方・作業手順・トラブル',safety:'まず安全を確保してください',contact:'現場の緊急連絡先',missing:'緊急連絡先は未設定です。',publicCall:'日本の消防・救急 119',support:'相談窓口',hr:'社内相談窓口（人事部）',demo:'デモ用・実際には連絡できません',external:'外部の相談窓口',stress:'仕事のストレスや心の悩み',harassment:'職場のハラスメントに関する情報と相談先'},
  en:{urgency:'Choose urgency',category:'Choose a category',urgent:'Urgent',normal:'Routine',urgentHelp:'Immediate help for an injury or accident',normalHelp:'Help that can wait',people:'Workplace relationships',rules:'Rules and policies',work:'Work tasks',peopleHelp:'Relationships, harassment and support contacts',rulesHelp:'Leave, working hours and pay',workHelp:'Equipment, procedures and troubleshooting',safety:'Get to safety first',contact:'Workplace emergency contact',missing:'No workplace emergency contact is configured.',publicCall:'Fire and ambulance in Japan: 119',support:'Support contacts',hr:'Internal support (Human Resources)',demo:'Demo only. These contacts are inactive.',external:'External support',stress:'Work stress and mental health',harassment:'Workplace harassment information and support'},
  vi:{urgency:'Chọn mức độ khẩn cấp',category:'Chọn chủ đề',urgent:'Khẩn cấp',normal:'Thông thường',urgentHelp:'Cần hỗ trợ ngay khi có chấn thương hoặc tai nạn',normalHelp:'Có thể chờ hỗ trợ',people:'Quan hệ nơi làm việc',rules:'Nội quy và chế độ',work:'Công việc',peopleHelp:'Quan hệ, quấy rối và nơi tư vấn',rulesHelp:'Nghỉ phép, giờ làm và lương',workHelp:'Thiết bị, quy trình và xử lý sự cố',safety:'Hãy bảo đảm an toàn trước tiên',contact:'Liên hệ khẩn cấp tại nơi làm việc',missing:'Chưa có thông tin liên hệ khẩn cấp.',publicCall:'Cứu hỏa và cấp cứu tại Nhật: 119',support:'Địa chỉ tư vấn',hr:'Tư vấn nội bộ (phòng nhân sự)',demo:'Chỉ minh họa, không thể liên hệ.',external:'Tư vấn bên ngoài',stress:'Căng thẳng và sức khỏe tinh thần',harassment:'Thông tin và tư vấn về quấy rối nơi làm việc'},
};
export function ConsultationRouting({stage,language,contact,onSelect}:{stage:ConsultationStage;language:Language;contact?:{contact:string;instructions:string};onSelect:(stage:ConsultationStage)=>void}){
  const t=labels[language];
  function card(next:ConsultationStage,icon:string,title:string,description:string){
    return <button type="button" className={'routing-card routing-'+next} onClick={()=>onSelect(next)}>
      <span aria-hidden="true">{icon}</span><span><strong>{title}</strong><small>{description}</small></span><span aria-hidden="true">›</span>
    </button>;
  }
  if(stage==='urgency')return <section className="panel flow"><div className="eyebrow">1 / 2</div><h2>{t.urgency}</h2>{card('urgent','⚠',t.urgent,t.urgentHelp)}{card('category','✓',t.normal,t.normalHelp)}</section>;
  if(stage==='category')return <section className="panel flow"><div className="eyebrow">2 / 2</div><h2>{t.category}</h2>{card('people','♧',t.people,t.peopleHelp)}{card('rules','▤',t.rules,t.rulesHelp)}{card('work','⚙',t.work,t.workHelp)}</section>;
  if(stage==='urgent'){
    const number=contact?.contact.trim();
    return <section className="panel flow safety-card"><h2>{t.safety}</h2><h3>{t.contact}</h3>
      {number?<p>{/^\+?[\d ()-]+$/.test(number)&&number.replace(/\D/g,'').length>=7?<a href={'tel:'+number.replace(/[^\d+]/g,'')}>{number}</a>:number}</p>:contact&&<p>{t.missing}</p>}
      {contact?.instructions&&<p>{contact.instructions}</p>}
      <a className="emergency-call" href="tel:119">{t.publicCall}</a>
    </section>;
  }
  if(stage==='people')return <section className="panel flow"><h2>{t.support}</h2><div className="notice"><h3>{t.hr}</h3><p>{hr.email}</p><p>{hr.phone}</p><small>{t.demo}</small></div>
    <h3>{t.external}</h3>
    <a href="https://kokoro.mhlw.go.jp/" target="_blank" rel="noreferrer">こころの耳 · {t.stress} ↗</a>
    <a href="https://www.no-harassment.mhlw.go.jp/" target="_blank" rel="noreferrer">あかるい職場応援団 · {t.harassment} ↗</a>
  </section>;
  return null;
}
