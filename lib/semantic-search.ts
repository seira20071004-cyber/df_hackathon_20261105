import {createHash} from 'node:crypto';
import type {Manual} from './model';
import {blockText} from './manual-graph.ts';
export function semanticText(manual:Manual){return [manual.content.title,manual.program?.description??'',...(manual.program?manual.program.blocks.map(block=>[block.id,blockText(block),block.type==='branch'?block.choices.map(choice=>`${choice.label} → ${choice.nextBlockId??'管理者'}`).join('; '):block.type==='check'?`未解決 → ${block.failureNextBlockId??'管理者'}`:`次 → ${block.nextBlockId??'管理者'}`].join(' ')):manual.content.steps),...manual.content.cautions].join('\n').slice(0,12000);}
export function semanticHash(manual:Manual){return createHash('sha256').update(semanticText(manual)).digest('hex');}
export function cosine(a:number[],b:number[]){if(!a.length||a.length!==b.length||![...a,...b].every(Number.isFinite))return -1;const norm=Math.hypot(...a)*Math.hypot(...b);return norm?a.reduce((sum,value,index)=>sum+value*b[index],0)/norm:-1;}
