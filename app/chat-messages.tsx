'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {copy} from '../lib/copy';
import type {Language,Question} from '../lib/model';

type Translation=string|null|false;
type RequestTranslations=(ids:string[])=>Promise<{translations:{id:string;text:Translation}[]}>;
const translationLabels={
 ja:{label:'翻訳',retry:'翻訳を再試行'},
 en:{label:'Translation',retry:'Retry translation'},
 vi:{label:'Bản dịch',retry:'Thử dịch lại'},
};

export function ChatMessages({question,viewerId,language,requestTranslations}:{
 question:Question;viewerId:string;language:Language;requestTranslations:RequestTranslations;
}){
 const [translations,setTranslations]=useState<Record<string,Translation>>({});
 const attempted=useRef(new Set<string>());
 const queue=useRef(Promise.resolve());
 const ids=JSON.stringify(['opening',...question.messages.map(message=>message.id)]);
 const labels=translationLabels[language];

 const load=useCallback(async(ids:string[])=>{
  try{
   const result=await requestTranslations(ids);
   setTranslations(current=>({...current,...Object.fromEntries(result.translations.map(row=>[row.id,row.text]))}));
  }catch{
   setTranslations(current=>({...current,...Object.fromEntries(ids.map(id=>[id,false as const]))}));
  }
 },[requestTranslations]);

 useEffect(()=>{
  const pending=(JSON.parse(ids) as string[]).filter(id=>!attempted.current.has(id));
  pending.forEach(id=>attempted.current.add(id));
  for(let i=0;i<pending.length;i+=8){
   const batch=pending.slice(i,i+8);
   queue.current=queue.current.then(()=>load(batch));
  }
 },[ids,load]);

 function translation(id:string){
  const result=translations[id];
  if(result===false)return <button type="button" className="link" onClick={()=>{
   setTranslations(current=>{const next={...current};delete next[id];return next;});
   queue.current=queue.current.then(()=>load([id]));
  }}>{labels.retry}</button>;
  return result?<small className="chat-translation" aria-label={labels.label} lang={language}><strong>{labels.label}：</strong>{result}</small>:null;
 }

 return <div className="messages" aria-label={copy(language,'cases')}>
  <article className={'bubble '+(question.employeeId===viewerId?'own':'')}>
   <p lang={question.originalLanguage}>{question.originalText}</p>
   {translation('opening')}
  </article>
  {question.messages.map(message=><article key={message.id} className={'bubble '+(message.senderId===viewerId?'own':'')}>
   <small>{message.senderName?message.senderName+' · ':''}{copy(language,message.role)} · {new Date(message.createdAt).toLocaleString(language)}</small>
   <p>{message.originalText}</p>
   {translation(message.id)}
  </article>)}
 </div>;
}
