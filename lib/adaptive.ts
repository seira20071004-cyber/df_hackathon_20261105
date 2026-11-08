import {z} from 'zod';

export const types=['troubleshooting','procedure','work_instruction','information_support','unknown'] as const;
export const risks=['normal','caution','emergency','unknown'] as const;
export type ConsultationType=typeof types[number];
export type Risk=typeof risks[number];
export const manualApplicabilitySchema=z.object({category:z.enum(types),secondary:z.array(z.enum(types)).max(3),target:z.string().trim().max(240),conditions:z.string().trim().max(500),exclusions:z.string().trim().max(500)}).strict();
export type ManualApplicability=z.infer<typeof manualApplicabilitySchema>;
const fields=['target','symptom','situation','error','attempt','result','missing'] as const;
export const analysisSchema=z.object({
 primary:z.enum(types),secondary:z.array(z.enum(types)).max(3),risk:z.enum(risks),
 riskEvidence:z.array(z.object({sourceId:z.string().max(180),quote:z.string().min(1).max(240)})).max(4).optional(),
 facts:z.array(z.object({field:z.enum(fields),state:z.enum(['confirmed','inferred','unknown','conflicting']),value:z.string().max(240),sourceId:z.string().max(180),quote:z.string().max(240)})).max(14),
 question:z.object({field:z.enum(fields),text:z.string().min(1).max(200),options:z.array(z.string().min(1).max(100)).max(4)}).nullable()
});
export const evaluationSchema=z.object({ratings:z.array(z.object({id:z.string(),verdict:z.enum(['applicable','needs_clarification','not_applicable','unsafe'])})).max(12),question:analysisSchema.shape.question});
export const knowledgeSchema=z.object({decision:z.enum(['new_manual','update_existing','duplicate','skip']),manualId:z.string().max(120).nullable()});
export type Analysis=z.infer<typeof analysisSchema>;
export type Clarification=z.infer<typeof analysisSchema>['question'];
export type AnalysisSource={id:string;text:string;prompt?:string};
export type IntakeAnswer={field:string;text:string;prompt?:string;unknown?:true};
export function intakeSources(answers:IntakeAnswer[]):AnalysisSource[]{
 return answers.flatMap((answer,index)=>answer.unknown?[]:[{
  id:'intake:'+index,text:answer.text,...(answer.prompt?{prompt:answer.prompt}:{})
 }]);
}
export const categoryLabels:Record<ConsultationType,string>={troubleshooting:'トラブル解決',procedure:'業務手続き',work_instruction:'作業方法',information_support:'情報・翻訳',unknown:'分類不明'};
export type AdaptiveDetails={analysis:Analysis;question:Clarification;mode:'results'|'clarify'|'safety'|'handoff';safety?:{contact:string;instructions:string}};
export const guidance:Record<ConsultationType,string>={
 troubleshooting:'対象機種、症状、エラー表示、試した操作と結果を確認。候補を区別できる条件を優先。条件分岐は裏づけがある場合のみ。',
 procedure:'申請条件、必要書類・情報、申請先、承認の要否を確認。作業順と承認待ちを分ける。',
 work_instruction:'場所、対象、道具、安全上の注意、完了条件を確認。準備と確認のチェックリストを使う。',
 information_support:'分からない原文・用語を特定し、原文と説明を分ける。根拠がある場合のみ短い用語解説を使う。',
 unknown:'問題を断定せず、対象か目的を1点だけ確認。'
};
export function explicitRisk(text:string,keywords:string[]=[]):Risk{
 const value=text.normalize('NFKC').toLowerCase();
 if(/薬品.{0,12}(こぼ|漏れ)|出火|火災|煙が|感電|意識がない|chemical spill|on fire|electric shock|hóa chất.{0,18}(đổ|tràn)|cháy lớn/u.test(value))return 'emergency';
 if(keywords.some(term=>term.trim()&&value.includes(term.normalize('NFKC').toLowerCase()))||/アレルギー|冷蔵庫.{0,10}温度.{0,4}高|機械.{0,10}異音|フォークリフト.{0,12}警告|allerg|forklift.{0,16}warning|unusual noise|dị ứng|xe nâng.{0,14}cảnh báo/u.test(value))return 'caution';
 return 'unknown';
}
export function reconcileAnalysis(ai:Analysis|null,sources:AnalysisSource[],keywords:string[]=[]):Analysis{
 const local=explicitRisk(sources.map(row=>row.text).join('\n'),keywords),order:Risk[]=['normal','unknown','caution','emergency'];
 const modelRisk=ai?.risk??'unknown';
 const risk=local==='unknown'?modelRisk:order.indexOf(local)>order.indexOf(modelRisk)?local:modelRisk;
 const facts=(ai?.facts??[]).map(row=>{
  const supported=Boolean(row.quote&&sources.some(source=>source.id===row.sourceId&&source.text.includes(row.quote)));
  if(row.sourceId.startsWith('photo:'))return {...row,state:'inferred' as const,sourceId:supported?row.sourceId:'',quote:supported?row.quote:''};
  if(!supported)return {...row,state:row.state==='unknown'?'unknown' as const:'inferred' as const,sourceId:'',quote:''};
  return {...row,value:row.state==='confirmed'?row.quote:row.value};
 });
 const primary=ai?.primary??'unknown';
 const citedRisk=ai?.riskEvidence?.filter(row=>sources.some(source=>source.id===row.sourceId&&source.text.includes(row.quote)))??[];
 const riskEvidence=local==='unknown'?citedRisk:sources.flatMap(source=>{
  const slices=source.text.match(/[^。！？\n]{1,240}/gu)??[];
  const quote=slices.find(slice=>explicitRisk(slice,keywords)===local);
  return quote?[{sourceId:source.id,quote}]:[];
 }).slice(0,4);
 return {primary,riskEvidence,secondary:[...new Set(ai?.secondary??[])].filter(type=>type!==primary&&type!=='unknown'),risk,facts,question:ai?.question??null};
}
export function nextClarification(analysis:Analysis,priorFields:string[],candidate?:Clarification){
 if(priorFields.length>=3||analysis.risk==='emergency'||analysis.risk==='caution')return null;
 const known=new Set([...priorFields,...analysis.facts.filter(row=>row.state==='confirmed').map(row=>row.field)]);
 return [candidate,analysis.question].find(row=>row&&!known.has(row.field))??null;
}
export function applicableIds(ratings:z.infer<typeof evaluationSchema>['ratings'],allowed:string[]){
 return allowed.filter(id=>{const votes=ratings.filter(row=>row.id===id);return votes.length===1&&votes[0].verdict==='applicable';}).slice(0,3);
}
export function compatibleCodes(query:string,document:string){
 const codes=(value:string)=>value.toUpperCase().match(/\b(?:ERR(?:OR)?[-_ ]?|[EF][-_]?)\d{2,6}\b/g)?.map(code=>code.replace(/[-_ ]/g,''))??[];
 const requested=codes(query),recorded=codes(document);
 return !requested.length||!recorded.length||requested.every(code=>recorded.includes(code));
}
