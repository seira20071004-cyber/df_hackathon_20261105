'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {copy} from '../lib/copy';
import {languageNames,languages,type Language,type Profile} from '../lib/model';

export type AppTab='home'|'cases'|'manuals'|'settings';
const labels={ja:{menu:'メニュー',close:'メニューを閉じる',settings:'設定',management:'管理画面',account:'アカウント情報',name:'氏名',company:'会社名',role:'立場',unset:'未登録',site:'現場',language:'表示言語'},
  en:{menu:'Menu',close:'Close menu',settings:'Settings',management:'Management',account:'Account information',name:'Name',company:'Company',role:'Role',unset:'Not provided',site:'Site',language:'Display language'},
  vi:{menu:'Menu',close:'Đóng menu',settings:'Cài đặt',management:'Quản lý',account:'Thông tin tài khoản',name:'Họ tên',company:'Công ty',role:'Vai trò',unset:'Chưa đăng ký',site:'Địa điểm',language:'Ngôn ngữ hiển thị'}};
function Icon({name}:{name:'menu'|'settings'|'home'|'cases'|'manuals'|'close'|'person'}) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name==='menu'?<path d="M4 6h16M4 12h16M4 18h16"/>:name==='close'?<path d="m6 6 12 12M6 18 18 6"/>:name==='settings'?<><path d="m9 3-.8 2.3-2.4.4-1.5 2.6 1.1 2.2L4 12.5l1.3 2.6 2.4.4.8 2.3h3l.8-2.3 2.4-.4 1.3-2.6-1.4-2 1.1-2.2-1.5-2.6-2.4-.4L12 3Z" transform="translate(2 1)"/><circle cx="12" cy="11.5" r="2.5"/></>:name==='home'?<><path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/></>:name==='cases'?<path d="M4 4h16v12H9l-5 4V4ZM8 8h8M8 12h5"/>:name==='manuals'?<><path d="M4 4h16v17H4zM8 4v17M11 8h6M11 12h6"/></>:<><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>}
  </svg>;
}
function AccountFields({profile,language}:{profile:Profile;language:Language}) {
  const text=labels[language];
  return <dl className="account-fields"><div><dt>{text.name}</dt><dd>{profile.name}</dd></div>
    <div><dt>{text.company}</dt><dd>{profile.companyName || text.unset}</dd></div>
    <div><dt>{text.role}</dt><dd>{copy(language,profile.role)}</dd></div></dl>;
}
export function WorkspaceShell({profile,language,tab,unread,demo,onNavigate,onSignOut,busy,children}:{
  profile:Profile;language:Language;tab:AppTab;unread:number;demo:boolean;onNavigate:(tab:AppTab)=>void;onSignOut:()=>void;busy:boolean;children:ReactNode;
}) {
  const [menu,setMenu]=useState(false),[account,setAccount]=useState(false);
  const menuButton=useRef<HTMLButtonElement>(null),accountButton=useRef<HTMLButtonElement>(null);
  const drawer=useRef<HTMLElement>(null),popover=useRef<HTMLDivElement>(null);
  const text=labels[language],t=(key:Parameters<typeof copy>[1])=>copy(language,key);
  const name=(item:AppTab)=>item==='settings'?text.settings:item==='home'&&profile.role==='manager'?text.management:t(item);
  function closeMenu(){setMenu(false);menuButton.current?.focus();}
  function navigate(next:AppTab){setMenu(false);setAccount(false);onNavigate(next);menuButton.current?.focus();}
  useEffect(()=>{
    if(!menu)return;
    const previous=document.body.style.overflow;document.body.style.overflow='hidden';
    const first=drawer.current?.querySelector<HTMLButtonElement>('button');first?.focus();
    return ()=>{document.body.style.overflow=previous;};
  },[menu]);
  useEffect(()=>{if(account)popover.current?.focus();},[account]);
  useEffect(()=>{
    function dismiss(event:PointerEvent){if(account && !popover.current?.contains(event.target as Node) && !accountButton.current?.contains(event.target as Node))setAccount(false);}
    function keyboard(event:KeyboardEvent){
      if(event.key==='Escape'){if(menu){setMenu(false);menuButton.current?.focus();}if(account){setAccount(false);accountButton.current?.focus();}}
      if(menu&&event.key==='Tab'){
        const items=drawer.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');if(!items?.length)return;
        const first=items[0],last=items[items.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    }
    document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',keyboard);
    return ()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',keyboard);};
  },[menu,account]);
  return <div className="workspace-layout">
    <header className="workspace-topbar"><div className="workspace-heading">
      <button ref={menuButton} type="button" className="shell-icon" aria-label={text.menu} aria-expanded={menu} aria-controls="workspace-drawer" onClick={()=>{setAccount(false);setMenu(!menu);}}><Icon name="menu"/></button>
      <span className="shell-brand">Bridge<span>Work</span></span><span className="shell-separator"/><strong>{name(tab)}</strong>
    </div><div className="workspace-topright">{demo&&<span className="badge demo shell-demo">{t('demo')}</span>}
      <div className="account-control"><button ref={accountButton} type="button" className="account-circle" aria-label={text.account} aria-expanded={account} aria-controls="account-popover" onClick={()=>{setMenu(false);setAccount(!account);}}>{profile.photo&&/^https:\/\/lh[0-9]+\.googleusercontent\.com\//.test(profile.photo)?<img src={profile.photo} alt="" referrerPolicy="no-referrer"/>:<Icon name="person"/>}</button>
        {account&&<div ref={popover} tabIndex={-1} role="dialog" aria-label={text.account} id="account-popover" className="account-popover">
          <h2>{text.account}</h2><AccountFields profile={profile} language={language}/>
          <button className="secondary" onClick={()=>navigate('settings')}><Icon name="settings"/>{text.settings}</button>
          <button className="link" disabled={busy} onClick={()=>{setAccount(false);onSignOut();}}>{t('signout')}</button>
        </div>}
      </div></div></header>
    {menu&&<><button className="drawer-backdrop" tabIndex={-1} aria-label={text.close} onClick={closeMenu}/>
      <aside ref={drawer} role="dialog" aria-modal="true" aria-label={text.menu} id="workspace-drawer" className="workspace-drawer">
        <div className="drawer-heading"><strong>Bridge<span>Work</span></strong><button className="shell-icon" type="button" onClick={closeMenu} aria-label={text.close}><Icon name="close"/></button></div>
        <nav aria-label={text.menu}>{(['home','cases','manuals'] as AppTab[]).map(item=><button type="button" key={item} className={'drawer-link '+(tab===item?'current':'')} aria-current={tab===item?'page':undefined} onClick={()=>navigate(item)}>
          <Icon name={item as 'home'|'cases'|'manuals'}/>{name(item)}{item==='manuals'&&unread>0&&<span className="notification-count">{unread}</span>}
        </button>)}</nav><div className="drawer-bottom"><button type="button" className={'drawer-link '+(tab==='settings'?'current':'')} onClick={()=>navigate('settings')}><Icon name="settings"/>{text.settings}</button></div>
      </aside></>}
    <main className={'content flow workspace-content '+(profile.role==='employee'?'staff-workspace':'manager-workspace')}>{children}</main>
    {profile.role==='manager'&&<nav className="staff-bottom manager-bottom" aria-label={text.menu}>{(['cases','manuals','settings'] as const).map(item=><button key={item} type="button" aria-current={tab===item?'page':undefined} onClick={()=>navigate(item)}><Icon name={item}/>{item==='settings'?({ja:'メンバー',en:'Members',vi:'Thành viên'}[language]):name(item)}</button>)}</nav>}
    {profile.role==='employee'&&<nav className="staff-bottom" aria-label={text.menu}>{(['home','cases','manuals'] as const).map(item=><button key={item} type="button" aria-current={tab===item?'page':undefined} onClick={()=>navigate(item)}><Icon name={item}/>{name(item)}</button>)}</nav>}
  </div>;
}
export function Settings({profile,language,site,busy,onLanguage,onSite}:{profile:Profile;language:Language;site:string;busy:boolean;onLanguage:(language:Language)=>void;onSite:(site:string)=>void}) {
  const text=labels[language];
  return <section className="panel flow settings-panel"><h2>{text.settings}</h2>
    <section><h3>{text.account}</h3><AccountFields profile={profile} language={language}/></section>
    <label>{text.language}<select value={language} disabled={busy} onChange={event=>onLanguage(event.target.value as Language)}>{languages.map(code=><option key={code} value={code}>{languageNames[code]}</option>)}</select></label>
    <label>{text.site}<select value={site} disabled={busy} onChange={event=>onSite(event.target.value)}>{profile.siteIds.map(id=><option value={id} key={id}>{id==='sakura'?'Sakura Building':id}</option>)}</select></label>
  </section>;
}
