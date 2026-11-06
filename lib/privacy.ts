import {applicationDefault} from 'firebase-admin/app';
import {localInspect,mapStrings,summarizeFindings,textValues,type Finding,type Inspection} from './security-content.ts';
const types=['PERSON_NAME','PHONE_NUMBER','EMAIL_ADDRESS','STREET_ADDRESS','CREDIT_CARD_NUMBER','IBAN_CODE','AUTH_TOKEN','PASSWORD'];
const credential=applicationDefault();
export const strictPrivacy=()=>process.env.BRIDGE_DEMO!=='true'||process.env.BRIDGE_PRIVACY_STRICT==='true';
type CloudFinding={infoType?:{name?:string};location?:{byteRange?:{start?:string|number;end?:string|number}}};
async function inspectGoogle(text:string){
 const project=process.env.BRIDGE_DLP_PROJECT||process.env.GOOGLE_CLOUD_PROJECT;
 if(!project)throw new Error('privacy-unavailable');
 const access=await credential.getAccessToken();
 const response=await fetch('https://dlp.googleapis.com/v2/projects/'+encodeURIComponent(project)+'/locations/global/content:inspect',{
  method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+access.access_token,'Content-Type':'application/json'},
  body:JSON.stringify({item:{value:text},inspectConfig:{infoTypes:types.map(name=>({name})),includeQuote:false,limits:{maxFindingsPerRequest:100},minLikelihood:'POSSIBLE'}})});
 if(!response.ok)throw new Error('privacy-unavailable');const data=await response.json();
 if(data.result?.findingsTruncated||!data.result||!Array.isArray(data.result.findings??[]))throw new Error('privacy-unavailable');
 return (data.result.findings??[]) as CloudFinding[];
}
export async function inspectContent(value:unknown,{mask=false,cloudInspect=inspectGoogle}:{mask?:boolean;cloudInspect?:(text:string)=>Promise<CloudFinding[]>}={}){
 const findings:Finding[]=[];let available=true,complete=process.env.BRIDGE_SENSITIVE_PROVIDER==='google-dlp';
 if(textValues(value).some(text=>/^data:image\//.test(text))&&strictPrivacy())return {value,report:{provider:'local' as const,available:false,complete:false,findings:[{type:'image-inspection-required',risk:'high' as const,count:1}]}};
 // One batch per value, not a paid request for every field. Keep AI context boundaries intact.
 let result=await mapStrings(value,async text=>{const local=localInspect(text);findings.push(...local.findings);return mask?local.text:text;});
 if(complete){try{
  const values=textValues(result),joined=values.join('\n');if(Buffer.byteLength(joined)>200_000)throw new Error('privacy-unavailable');
  const detected=joined?await cloudInspect(joined):[];
  for(const finding of detected)findings.push({type:types.includes(finding.infoType?.name??'')?finding.infoType!.name!:'sensitive',risk:'medium',count:1});
  // Cloud findings must be redacted before sending to Gemini. Range mapping is applied to the same joined bytes.
  if(mask&&detected.length){
   const bytes=Buffer.from(joined),ranges=detected.map(f=>({start:Number(f.location?.byteRange?.start??0),end:Number(f.location?.byteRange?.end)}));
   if(ranges.some(r=>!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.end)||r.start<0||r.end<=r.start||r.end>bytes.length))throw new Error('privacy-unavailable');
   const merged:{start:number;end:number}[]=[];for(const range of ranges.sort((a,b)=>a.start-b.start)){const previous=merged.at(-1);if(previous&&range.start<=previous.end)previous.end=Math.max(previous.end,range.end);else merged.push({...range});}
   let offset=0;result=await mapStrings(result,async text=>{const start=offset,end=start+Buffer.byteLength(text);offset=end+1;let output=Buffer.from(text);const selected=merged.filter(r=>r.start<end&&r.end>start).map(r=>({start:Math.max(0,r.start-start),end:Math.min(end-start,r.end-start)})).sort((a,b)=>b.start-a.start);
    for(const range of selected)output=Buffer.concat([output.subarray(0,range.start),Buffer.from('[SENSITIVE]'),output.subarray(range.end)]);return output.toString('utf8');});
  }
 }catch{available=false;complete=false;}}
 else if(strictPrivacy())available=false;
 const report:Inspection={provider:process.env.BRIDGE_SENSITIVE_PROVIDER==='google-dlp'?'google-dlp':'local',available,complete,findings:summarizeFindings(findings)};
 return {value:result,report};
}
export async function protectAiData<T>(data:T):Promise<T>{const checked=await inspectContent(data,{mask:true});if(!checked.report.available)throw new Error('privacy-unavailable');return checked.value as T;}
export async function publicationInspection(value:unknown){const checked=await inspectContent(value);return checked.report;}
export function safeToPublish(report:Inspection){return report.available&&(!strictPrivacy()||report.complete)&&report.findings.length===0;}
