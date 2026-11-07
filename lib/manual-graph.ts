import {z} from 'zod';

const text=z.string().trim().min(1).max(500),id=z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/);
const sourceIds=z.array(z.string().min(1).max(180)).max(8);
const next=id.nullable();
export const stepPresentations=['instruction','checklist','explanation','approval'] as const;
const base={id,sourceMessageIds:sourceIds};
export const CONTACT_TEXT='この操作は案内できません。作業を中止して管理者に確認してください。';
export const blockSchema=z.discriminatedUnion('type',[
  z.object({...base,type:z.literal('step'),presentation:z.enum(stepPresentations).optional(),title:text,content:text,supplement:z.string().max(500),nextBlockId:next,
    restricted:z.boolean(),authorizationSourceMessageIds:sourceIds}),
  z.object({...base,type:z.literal('branch'),question:text,choices:z.array(z.object({id,label:text,nextBlockId:next})).min(2).max(4)}),
  z.object({...base,type:z.literal('warning'),content:text,severity:z.enum(['notice','stop']),nextBlockId:next}),
  z.object({...base,type:z.literal('check'),content:text,successNextBlockId:z.null(),failureNextBlockId:next})
]);
export const programSchema=z.object({title:text,description:z.string().max(700),language:z.enum(['ja','en','vi']),startBlockId:id,blocks:z.array(blockSchema).min(1).max(24)});
export type ManualProgram=z.infer<typeof programSchema>;
export type ManualBlock=z.infer<typeof blockSchema>;
export const factEvidence=z.object({messageId:z.string().min(1).max(180),quote:z.string().trim().min(1).max(1500)});
export const extractedChatSchema=z.object({
  title:text,description:z.string().max(700),
  facts:z.array(z.object({id,kind:z.enum(['symptom','target','condition','exclusion','scope','cause','attempt','action','result','warning','criterion','authorization']),
    text,status:z.enum(['current','superseded']),evidence:z.array(factEvidence).min(1).max(4)})).max(32),
  unknowns:z.array(text).max(8),causeKnown:z.boolean(),hasAlternativeMethods:z.boolean(),successfulActionIds:z.array(id).max(12)
});
export type ExtractedChat=z.infer<typeof extractedChatSchema>;
export const gapQuestionSchema=z.object({id,question:text,reason:text,sourceMessageIds:sourceIds});
export const gapSchema=z.object({ready:z.boolean(),hold:z.boolean(),questions:z.array(gapQuestionSchema).max(3)});
export type GapQuestion=z.infer<typeof gapQuestionSchema>;
export const qualitySchema=z.object({accurate:z.boolean(),complete:z.boolean(),clear:z.boolean(),safe:z.boolean(),
  checks:z.array(z.object({blockId:id,supported:z.boolean(),conditionsPreserved:z.boolean(),safe:z.boolean(),clear:z.boolean(),reason:z.string().max(500)})).max(24),
  issues:z.array(z.object({blockId:id.nullable(),category:z.enum(['accuracy','completeness','clarity','safety','structure']),message:text})).max(24)});
export type QualityReport=z.infer<typeof qualitySchema>;
export type AdditionalAnswer={id:string;questionId:string;question:string;answer:string;round:number;answeredBy:string;createdAt:string};

export function nextIds(block:ManualBlock):(string|null)[]{
  return block.type==='branch'?block.choices.map(choice=>choice.nextBlockId):block.type==='check'?[block.successNextBlockId,block.failureNextBlockId]:[block.nextBlockId];
}
export function graphIssues(program:ManualProgram) {
  const issues:string[]=[];const blocks=new Map(program.blocks.map(block=>[block.id,block]));
  if(blocks.size!==program.blocks.length)issues.push('ブロックIDが重複しています');
  if(!blocks.has(program.startBlockId))issues.push('開始ブロックが存在しません');
  for(const block of program.blocks){
    for(const target of nextIds(block))if(target!==null&&!blocks.has(target))issues.push(`${block.id}: 遷移先 ${target} が存在しません`);
    if(block.type==='branch'&&(new Set(block.choices.map(choice=>choice.id)).size!==block.choices.length || new Set(block.choices.map(choice=>choice.label.trim())).size!==block.choices.length))issues.push(`${block.id}: 選択肢が重複しています`);
    if(block.type==='warning'&&block.severity==='stop'&&block.nextBlockId!==null)issues.push(`${block.id}: 作業中止の警告から操作へ進むことはできません`);
  }
  const visited=new Set<string>(),active=new Set<string>();
  function visit(key:string){if(active.has(key)){issues.push(`${key}: 循環があります`);return;}if(visited.has(key)||!blocks.has(key))return;
    visited.add(key);active.add(key);for(const key2 of nextIds(blocks.get(key)!))if(key2)visit(key2);active.delete(key);}
  visit(program.startBlockId);for(const block of program.blocks)if(!visited.has(block.id))issues.push(`${block.id}: 開始位置から到達できません`);
  return [...new Set(issues)];
}
export function qualityIssues(program:ManualProgram,report:QualityReport){
  const issues=report.issues.map(issue=>`${issue.blockId??'全体'}: ${issue.message}`);
  if(!report.accurate||!report.complete||!report.clear||!report.safe)issues.push('正確性・完全性・明瞭性・安全性の検証が不合格です');
  if(report.checks.length!==program.blocks.length || report.checks.some(check=>!program.blocks.some(block=>block.id===check.blockId)))issues.push('照合項目とブロックが一致しません');
  for(const block of program.blocks){const checks=report.checks.filter(check=>check.blockId===block.id);
    if(checks.length!==1)issues.push(`${block.id}: 照合結果の欠落または重複`);
    else if(!checks[0].supported||!checks[0].conditionsPreserved||!checks[0].safe||!checks[0].clear)issues.push(`${block.id}: ${checks[0].reason||'原文との不一致'}`);
  }return [...new Set(issues)];
}
export function validRunPath(program:ManualProgram,path:string[],outcome:'resolved'|'unresolved') {
  if(graphIssues(program).length||!path.length||path[0]!==program.startBlockId||new Set(path).size!==path.length)return false;
  const blocks=new Map(program.blocks.map(block=>[block.id,block]));
  for(let index=0;index<path.length;index++){const block=blocks.get(path[index]);if(!block)return false;if(index+1<path.length&&!nextIds(block).includes(path[index+1]))return false;}
  return outcome==='unresolved'||blocks.get(path.at(-1)!)?.type==='check';
}
export function blockText(block:ManualBlock){return block.type==='step'?`${block.title}：${block.content}${block.supplement?'（'+block.supplement+'）':''}`:block.type==='branch'?block.question:block.content;}
export function programContent(program:ManualProgram){
  const steps=program.blocks.filter(block=>block.type==='step').map(blockText);
  return {title:program.title,task:program.title,purpose:program.description||program.title,tools:[],
    steps:steps.length?steps:[program.blocks.map(blockText).join('\n').slice(0,500)],cautions:program.blocks.filter(block=>block.type==='warning').map(blockText),mistakes:[],checks:[]};
}
export function paperProgram(program:ManualProgram){
  const words={ja:{block:'ブロック',contact:'管理者へ確認',yes:'解決した',no:'解決しない',done:'完了',warning:'注意・禁止',next:'次'},
    en:{block:'Block',contact:'Ask your manager',yes:'Resolved',no:'Not resolved',done:'Done',warning:'Warning',next:'Next'},
    vi:{block:'Khối',contact:'Hỏi quản lý',yes:'Đã giải quyết',no:'Chưa giải quyết',done:'Hoàn tất',warning:'Chú ý / Cấm',next:'Tiếp'}}[program.language];
  const number=(target:string|null)=>target?words.block+' '+String(program.blocks.findIndex(block=>block.id===target)+1).padStart(2,'0'):words.contact;
  const steps=program.blocks.map(block=>block.type==='branch'?`${block.question}\n${block.choices.map(choice=>`${choice.label} → ${number(choice.nextBlockId)}`).join('\n')}`:
    block.type==='check'?`${block.content}\n${words.yes} → ${words.done}\n${words.no} → ${number(block.failureNextBlockId)}`:
    block.type==='warning'?`${words.warning}：${block.content}${block.nextBlockId?'\n'+words.next+'：'+number(block.nextBlockId):'\n'+words.contact}`:
    `${blockText(block)}\n${words.next}：${number(block.nextBlockId)}`);
  return {...programContent(program),steps,cautions:[]};
}
export function graphShape(program:ManualProgram){return JSON.stringify({start:program.startBlockId,blocks:program.blocks.map(block=>({id:block.id,type:block.type,next:nextIds(block),sources:block.sourceMessageIds,
  ...(block.type==='step'?{restricted:block.restricted,authorization:block.authorizationSourceMessageIds,presentation:block.presentation}:{}),...(block.type==='warning'?{severity:block.severity}:{}),...(block.type==='branch'?{choices:block.choices.map(choice=>choice.id)}:{})}))});}
