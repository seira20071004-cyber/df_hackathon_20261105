'use client';

import {createContext,useContext} from 'react';
import {languageNames,type Language} from '../lib/model';

export const OrganizationLanguages=createContext<readonly Language[]>(['ja','en']);

export function LanguageSelector({language,onChange,disabled=false}:{language:Language;onChange:(code:Language)=>void;disabled?:boolean}){
  const organization=useContext(OrganizationLanguages);
  const other:Language[]=[...new Set([...organization,language])].filter(code=>code!=='ja'&&code!=='en');
  const primary:Language[]=['ja','en',...(other.length===1?other:[])];
  const more={ja:'その他',en:'Other',vi:'Khác'}[language];
  return <div className="manual-languages" role="group" aria-label="Language">
    {primary.map(code=><button type="button" key={code} aria-pressed={language===code} disabled={disabled}
      onClick={()=>onChange(code)}>{languageNames[code]}</button>)}
    {other.length>1&&<select aria-label={more} disabled={disabled} value={other.includes(language)?language:''}
      onChange={event=>{const selected=other.find(code=>code===event.target.value);if(selected)onChange(selected);}}>
      <option value="" disabled>{more}</option>
      {other.map(code=><option key={code} value={code}>{languageNames[code]}</option>)}
    </select>}
  </div>;
}
