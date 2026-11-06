'use client';

import { useId } from 'react';
import type { Language, StairRange } from '../lib/model';

const labels = {
  ja: {stairs:'階段', landing:'踊り場', range:'対象範囲', floor:(value:number)=>value+'階'},
  en: {stairs:'Stairs', landing:'Landing', range:'Cleaning area', floor:(value:number)=>'Floor '+value},
  vi: {stairs:'Cầu thang', landing:'Chiếu nghỉ', range:'Phạm vi', floor:(value:number)=>'Tầng '+value}
};

export function RangeDiagram({range, language}: {range:StairRange; language:Language}) {
  const id = useId().replace(/:/g,'');
  const text = labels[language];
  const floors = Array.from({length:range.toFloor-range.fromFloor+1},(_,index)=>range.fromFloor+index);
  const top = 70;
  const gap = Math.min(120,360/Math.max(1,floors.length-1));
  const bottom = top+(floors.length-1)*gap;
  const height = bottom+110;
  const floorY = (index:number)=>bottom-index*gap;
  return <figure className="range-diagram">
    <svg viewBox={'0 0 600 '+height} role="img" aria-label={text.range+' '+text.floor(range.fromFloor)+' – '+text.floor(range.toFloor)}>
      <defs>
        <linearGradient id={'wall-'+id} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f3f6fc"/><stop offset="1" stopColor="#d8e2f0"/></linearGradient>
        <linearGradient id={'step-'+id} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#2d7df9"/><stop offset="1" stopColor="#1256c9"/></linearGradient>
      </defs>
      <path d={'M155 70L260 25L438 85V'+(bottom+65)+'L335 '+(bottom+105)+'L155 '+(bottom+45)+'Z'} fill={'url(#wall-'+id+')'} stroke="#a6b8ce" strokeWidth="2"/>
      <path d={'M260 25V'+(bottom+60)+'M438 85L335 130L155 70'} fill="none" stroke="#b7c7da" strokeWidth="2"/>
      {floors.map((floor,index)=>{
        const y=floorY(index);
        return <g key={floor}>
          <path d={'M173 '+y+'L267 '+(y-40)+'L420 '+(y+12)+'L326 '+(y+52)+'Z'}
            fill={range.includeLandings ? '#a9ceff' : '#edf2f9'} stroke={range.includeLandings ? '#4b91ee' : '#c4cfdd'} strokeWidth="2"/>
          <path d={'M173 '+y+'V'+(y+8)+'L326 '+(y+60)+'L420 '+(y+20)+'V'+(y+12)+'L326 '+(y+52)+'Z'} fill="#d0dced" stroke="#a7bad2"/>
          <text x="368" y={y-8} className="diagram-floor">{text.floor(floor)}</text>
        </g>;
      })}
      {floors.slice(0,-1).map((floor,index)=>{
        const lower=floorY(index)+16;
        const upper=floorY(index+1)+16;
        return <g key={'flight-'+floor}>
          <path d={'M212 '+lower+'L274 '+(lower+20)+'L363 '+upper+'L301 '+(upper-20)+'Z'} fill={'url(#step-'+id+')'} stroke="#2364c7" strokeWidth="1.5"/>
          {Array.from({length:8},(_,step)=>{
            const progress=(step+1)/9;
            const x=212+(301-212)*progress;
            const y=lower+(upper-20-lower)*progress;
            return <path key={step} d={'M'+x+' '+y+'L'+(x+62)+' '+(y+20)+'v5'} fill="none" stroke="#9bcaff" strokeWidth="2"/>;
          })}
        </g>;
      })}
      <path d={'M460 '+(top-8)+'h14V'+(bottom+55)+'h-14'} stroke="#155bdd" strokeWidth="3" fill="none"/>
      <text x="489" y={(top+bottom)/2+12} className="diagram-range">{text.range}</text>
      <text x="489" y={(top+bottom)/2+36} className="diagram-range-small">{range.fromFloor}–{range.toFloor}</text>
      <g className="diagram-callout">
        <rect x="18" y={top+55} width="105" height="31" rx="7"/><text x="70" y={top+76} textAnchor="middle">{text.stairs}</text>
        <path d={'M123 '+(top+71)+'L270 '+(top+gap/2+21)} fill="none"/><circle cx="270" cy={top+gap/2+21} r="4"/>
        {range.includeLandings && <><rect x="18" y={bottom-18} width="105" height="31" rx="7"/><text x="70" y={bottom+3} textAnchor="middle">{text.landing}</text>
          <path d={'M123 '+(bottom-2)+'L199 '+(bottom+2)} fill="none"/><circle cx="199" cy={bottom+2} r="4"/></>}
      </g>
    </svg>
  </figure>;
}
