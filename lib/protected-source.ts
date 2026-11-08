import type {Profile,Question} from './model';
import type {AdditionalAnswer} from './manual-graph';
import {generationContext} from './interactive-generation.ts';
import {inspectContent} from './privacy.ts';
import {localInspect,type Inspection} from './security-content.ts';

type Context=ReturnType<typeof generationContext>['context'];
export type ProtectedSource={context?:Context;inspection?:Inspection;error?:string;approvedBy?:string;approvedAt?:string};
export async function prepareProtectedSource(profile:Profile,question:Question,answers:AdditionalAnswer[],prior?:ProtectedSource):Promise<ProtectedSource>{
 try{
  const raw=[question.originalText,question.resolution,...(question.intakeAnswers??[]).filter(row=>!row.unknown).map(row=>row.text),...question.messages.map(row=>row.originalText),...answers.map(row=>row.answer)];
  if(raw.some(line=>localInspect(line).findings.some(item=>item.risk==='high')))return {error:'sensitive-input-blocked'};
  const {context}=generationContext(profile,{...question,japaneseText:'',messages:question.messages.map(row=>({...row,translatedText:''}))},answers,{raw:true});
  if(prior?.context){
   context.sources=context.sources.map(row=>prior.context!.sources.find(old=>old.id===row.id)??row);
   context.resolutionNote=prior.context.resolutionNote;
  }
  context.question=context.sources[0].text;
  const inspected=await inspectContent(context,{mask:true});
  if(!inspected.report.available)return {error:'privacy-unavailable',inspection:inspected.report};
  if(inspected.report.findings.some(row=>row.risk==='high'||['AUTH_TOKEN','PASSWORD'].includes(row.type)))return {error:'sensitive-input-blocked',inspection:inspected.report};
  const safe=inspected.value as Context;
  for(const name of new Set([profile.name,...question.messages.map(row=>row.senderName??'')].filter(name=>name.length>=2))){for(const row of safe.sources)if(row.role!=='system')row.text=row.text.split(name).join('[氏名]');safe.resolutionNote=safe.resolutionNote.split(name).join('[氏名]');}
  safe.question=safe.sources[0].text;
  return {context:safe,inspection:inspected.report};
 }catch{return {error:'privacy-unavailable'};}
}
export function hideProtectedText(source:ProtectedSource,index:number,start:number,end:number):ProtectedSource{
 if(!source.context)throw new Error('invalid-selection');
 const context=structuredClone(source.context);
 const row=context.sources[index],value=index===context.sources.length?context.resolutionNote:row?.role==='system'?undefined:row?.text;
 if(value===undefined||start<0||end<=start||end>value.length)throw new Error('invalid-selection');
 const next=value.slice(0,start)+'[機密情報]'+value.slice(end);
 if(index===context.sources.length)context.resolutionNote=next;
 else {row.text=next;if(index===0)context.question=next;}
 return {context,inspection:source.inspection};
}
export function coversAnswers(source:ProtectedSource|undefined,answers:AdditionalAnswer[]){
 return Boolean(source?.context&&answers.every(answer=>source.context!.sources.some(row=>row.role==='manager_supplement'&&row.id===answer.id)));
}
