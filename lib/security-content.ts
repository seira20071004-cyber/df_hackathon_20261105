import {createHash} from 'node:crypto';
export type Finding={type:string;risk:'high'|'medium';count:number};
export type Inspection={provider:'local'|'google-dlp';available:boolean;complete:boolean;findings:Finding[]};
const rules:[string,'high'|'medium',RegExp][]=[
 ['credential','high',/\b(?:AIza[\w-]{30,}|AQ\.[\w-]{30,}|gh[pousr]_[\w]{20,}|github_pat_[\w]{20,}|sk-[\w-]{20,})\b/g],
 ['private_key','high',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?(?:-----END [^-]+-----|$)/g],
 ['credential','high',/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi],
 ['credential','high',/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g],
 ['credential','high',/(?:password|passwd|api[_ -]?key|access[_ -]?token|secret|パスワード|認証キー|アクセストークン)\s*[:=：]\s*["']?[^\s"',;\]}]{4,}/gi],
 ['email','medium',/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi],
 ['phone','medium',/(?<![A-Za-z0-9_-])(?:\+\d{1,3}[ -]?)?(?:\(\d{2,4}\)[ -]?|0\d{1,4}[ -]?)\d{2,4}[ -]?\d{3,4}(?![A-Za-z0-9_-])/g],
 ['address','medium',/(?:〒\s*\d{3}-?\d{4}[^\n]{0,80}|(?:東京都|北海道|京都府|大阪府|.{2,3}県)[^\s\n。]{4,80})/g],
 ['confidential','high',/(?:社外秘|極秘|顧客番号|customer[_ ]?id)\s*[:：=]\s*[^\n。]{1,100}/gi]
];
export function localInspect(value:string){let text=value;const findings:Finding[]=[];
 if(/^data:image\//.test(value))return {text,findings};
 for(const [type,risk,pattern] of rules){let count=0;pattern.lastIndex=0;text=text.replace(pattern,()=>{count++;return '['+type.toUpperCase()+']';});if(count)findings.push({type,risk,count});}
 return {text,findings};
}
export function textValues(value:unknown):string[]{if(typeof value==='string')return [value];if(Array.isArray(value))return value.flatMap(textValues);if(value&&typeof value==='object')return Object.values(value).flatMap(textValues);return [];}
export async function mapStrings(value:unknown,transform:(text:string)=>Promise<string>):Promise<unknown>{if(typeof value==='string')return transform(value);if(Array.isArray(value)){const result=[];for(const item of value)result.push(await mapStrings(item,transform));return result;}if(value&&typeof value==='object'){const result:Record<string,unknown>={};for(const [key,item] of Object.entries(value))result[key]=await mapStrings(item,transform);return result;}return value;}
export function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));return value;}
export const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function summarizeFindings(findings:Finding[]){return [...new Set(findings.map(f=>f.type))].map(type=>({type,risk:findings.some(f=>f.type===type&&f.risk==='high')?'high' as const:'medium' as const,count:findings.filter(f=>f.type===type).reduce((sum,f)=>sum+f.count,0)}));}
