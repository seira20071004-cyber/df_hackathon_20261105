'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {copy} from '../lib/copy';
import {type Language,type Profile} from '../lib/model';
import {LanguageSelector,OrganizationLanguages} from './language-selector';

export type AppTab='home'|'cases'|'manuals'|'members'|'settings';
export function Brand({compact=false}:{compact?:boolean}) {
  return <div className="brand">
    <span className="brand-icon" aria-hidden="true">
      <svg viewBox="0 0 32 32" width={compact?26:34} height={compact?26:34} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 6h15a2 2 0 0 1 2 2v10H11l-6 5V8a2 2 0 0 1 2-2Z"/>
        <path d="M23 12h4a2 2 0 0 1 2 2v13l-5-4h-8a2 2 0 0 1-2-2"/>
      </svg>
    </span>
    <div>Bridge <span>Work</span>{!compact&&<small>WORKPLACE SUPPORT</small>}</div>
  </div>;
}
const labels={ja:{navigation:'画面切り替え',members:'メンバー',settings:'設定',consultations:'相談',account:'アカウント情報',name:'氏名',company:'会社名',role:'立場',unset:'未登録',site:'現場',language:'表示言語'},
  en:{navigation:'Navigation',members:'Members',settings:'Settings',consultations:'Consultations',account:'Account information',name:'Name',company:'Company',role:'Role',unset:'Not provided',site:'Site',language:'Display language'},
  vi:{navigation:'Điều hướng',members:'Thành viên',settings:'Cài đặt',consultations:'Trao đổi',account:'Thông tin tài khoản',name:'Họ tên',company:'Công ty',role:'Vai trò',unset:'Chưa đăng ký',site:'Địa điểm',language:'Ngôn ngữ hiển thị'}};
function Icon({name}:{name:'settings'|'home'|'cases'|'manuals'|'person'|'members'}) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name==='members'?<><circle cx="9" cy="8" r="3"/><path d="M2 20v-2a7 7 0 0 1 14 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 4 5v1"/></>:name==='settings'?<><path d="m9 3-.8 2.3-2.4.4-1.5 2.6 1.1 2.2L4 12.5l1.3 2.6 2.4.4.8 2.3h3l.8-2.3 2.4-.4 1.3-2.6-1.4-2 1.1-2.2-1.5-2.6-2.4-.4L12 3Z" transform="translate(2 1)"/><circle cx="12" cy="11.5" r="2.5"/></>:name==='home'?<><path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/></>:name==='cases'?<path d="M4 4h16v12H9l-5 4V4ZM8 8h8M8 12h5"/>:name==='manuals'?<><path d="M4 4h16v17H4zM8 4v17M11 8h6M11 12h6"/></>:<><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>}
  </svg>;
}
function AccountFields({profile,language}:{profile:Profile;language:Language}) {
  const text=labels[language];
  return <dl className="account-fields"><div><dt>{text.name}</dt><dd>{profile.name}</dd></div>
    <div><dt>{text.company}</dt><dd>{profile.companyName || text.unset}</dd></div>
    <div><dt>{text.role}</dt><dd>{copy(language,profile.role)}</dd></div></dl>;
}
export function WorkspaceShell({profile,language,tab,unread,demo,onNavigate,onSignOut,busy,children,organizationLanguages}:{
  profile:Profile;language:Language;tab:AppTab;unread:number;demo:boolean;onNavigate:(tab:AppTab)=>void;onSignOut:()=>void;busy:boolean;children:ReactNode;organizationLanguages?:Language[];
}) {
  const [account,setAccount]=useState(false);
  const accountButton=useRef<HTMLButtonElement>(null),popover=useRef<HTMLDivElement>(null);
  const text=labels[language],t=(key:Parameters<typeof copy>[1])=>copy(language,key);
  const name=(item:AppTab)=>item==='settings'?text.settings:item==='members'?text.members:
    item==='cases'&&profile.role==='manager'?text.consultations:t(item);
  const tabs=profile.role==='manager'?(['cases','manuals','members'] as const):(['home','cases','manuals'] as const);
  function navigate(next:AppTab){setAccount(false);onNavigate(next);}
  useEffect(()=>{
    if(!account)return;
    popover.current?.focus();
    function dismiss(event:PointerEvent){
      if(!popover.current?.contains(event.target as Node)&&!accountButton.current?.contains(event.target as Node))setAccount(false);
    }
    function keyboard(event:KeyboardEvent){
      if(event.key==='Escape'){setAccount(false);accountButton.current?.focus();}
    }
    document.addEventListener('pointerdown',dismiss);
    document.addEventListener('keydown',keyboard);
    return ()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',keyboard);};
  },[account]);
  return <div className={'workspace-layout'+(profile.role==='manager'?' manager-layout':' employee-layout')}>
    <header className="workspace-topbar"><div className="workspace-heading">
      <Brand compact/>
    </div><div className="workspace-topright">{demo&&<span className="badge demo shell-demo">{t('demo')}</span>}
      <div className="account-control"><button ref={accountButton} type="button" className="account-circle" aria-label={text.account} aria-expanded={account} aria-controls="account-popover" onClick={()=>{setAccount(!account);}}>{profile.photo&&/^https:\/\/lh[0-9]+\.googleusercontent\.com\//.test(profile.photo)?<img src={profile.photo} alt="" referrerPolicy="no-referrer"/>:<Icon name="person"/>}</button>
        {account&&<div ref={popover} tabIndex={-1} role="dialog" aria-label={text.account} id="account-popover" className="account-popover">
          <h2>{text.account}</h2><AccountFields profile={profile} language={language}/>
          <button className="secondary" onClick={()=>navigate('settings')}><Icon name="settings"/>{text.settings}</button>
          <button className="link" disabled={busy} onClick={()=>{setAccount(false);onSignOut();}}>{t('signout')}</button>
        </div>}
      </div></div></header>
    <main className={'content flow workspace-content '+(profile.role==='employee'?'staff-workspace':'manager-workspace')}>
      <OrganizationLanguages.Provider value={organizationLanguages??['ja','en']}>{children}</OrganizationLanguages.Provider>
    </main>
    <nav className="staff-bottom" aria-label={text.navigation}>
      {tabs.map(item=><button key={item} type="button" aria-current={tab===item?'page':undefined} onClick={()=>navigate(item)}>
        <Icon name={item}/>{name(item)}{item==='manuals'&&unread>0&&<span className="notification-count">{unread}</span>}
      </button>)}
    </nav>
  </div>;
}
export function Settings({profile,language,site,busy,onLanguage,onSite}:{profile:Profile;language:Language;site:string;busy:boolean;onLanguage:(language:Language)=>void;onSite:(site:string)=>void}) {
  const text=labels[language];
  return <section className="panel flow settings-panel"><h2>{text.settings}</h2>
    <section><h3>{text.account}</h3><AccountFields profile={profile} language={language}/></section>
    <div>{text.language}<LanguageSelector language={language} disabled={busy} onChange={onLanguage}/></div>
    <label>{text.site}<select value={site} disabled={busy} onChange={event=>onSite(event.target.value)}>{profile.siteIds.map(id=><option value={id} key={id}>{id==='sakura'?'Sakura Building':id}</option>)}</select></label>
  </section>;
}
