'use client';

import {createContext,useEffect,useState} from 'react';
import {languageNames,type Language} from '../lib/model';

export const OrganizationLanguages=createContext<readonly Language[]>(['ja','en']);

export function LanguageSelector({language,onChange,disabled=false}:{language:Language;onChange:(code:Language)=>void;disabled?:boolean}){
  const [recent,setRecent]=useState<Language[]>([]);
  const other:Language[]=['vi'];
  useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem('bridge-recent-languages')||'[]');if(Array.isArray(saved))setRecent(saved.filter((code):code is Language=>other.includes(code)).slice(0,5));}catch{/* Storage can be unavailable. */}},[]);
  function choose(code:Language){
    if(code!=='ja'&&code!=='en'){
      const next=[code,...recent.filter(item=>item!==code)].slice(0,5);
      setRecent(next);try{localStorage.setItem('bridge-recent-languages',JSON.stringify(next));}catch{/* Language selection remains usable without storage. */}
    }
    onChange(code);
  }
  const more={ja:'その他',en:'Other',vi:'Khác'}[language];
  return <div className="manual-languages" role="group" aria-label="Language">
    {(['ja','en'] as const).map(code=><button type="button" key={code} aria-pressed={language===code} disabled={disabled}
      onClick={()=>choose(code)}>{languageNames[code]}</button>)}
    <select aria-label={more} disabled={disabled} value={other.includes(language)?language:''}
      onChange={event=>{const selected=other.find(code=>code===event.target.value);if(selected)choose(selected);}}>
      <option value="" disabled>{more}</option>
      {recent.length>0&&<optgroup label="最近使った言語">{recent.map(code=><option key={code} value={code}>{languageNames[code]}</option>)}</optgroup>}
      <optgroup label="言語">{other.filter(code=>!recent.includes(code)).map(code=><option key={code} value={code}>{languageNames[code]}</option>)}</optgroup>
    </select>
  </div>;
}
