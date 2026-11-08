import type {Manual} from './model';
import {digest} from './security-content.ts';
import {manualAccess,publishableAccess} from './manual-access.ts';
export function publicationPayload(manual:Manual){return {...(manual.kind?{kind:manual.kind}:{}),...(manual.applicability?{applicability:manual.applicability}:{}),...(manual.sourceDocument?{sourceDocument:manual.sourceDocument}:{}),...(manual.consultationType?{consultationType:manual.consultationType}:{}),...(manual.riskLevel?{riskLevel:manual.riskLevel}:{}),access:manualAccess(manual)??null,content:manual.content,translations:manual.translations,program:manual.program??null,programTranslations:manual.programTranslations??{},figures:manual.figures??[],imageUrls:manual.imageUrls,languages:manual.languages};}
export const publicationHash=(manual:Manual)=>digest(publicationPayload(manual));
export function releasedManual(manual:Manual):Manual|undefined{
 if(manual.publicationSuppressed)return;
 const released=manual.status==='published'?manual:manual.publishedSnapshot;
 if(!released||released.organizationId!==manual.organizationId||released.siteId!==manual.siteId||released.id!==manual.id||released.status!=='published'||!released.approvedBy)return;
 if(!publishableAccess(released))return;
 if(process.env.BRIDGE_DEMO!=='true'&&(!released.security?.inspection?.complete||released.security.inspection.findings.length||!released.security.inspection.available||released.security.contentHash!==publicationHash(released)))return;
 return released;
}
export function preservePublication(previous:Manual|undefined,next:Manual):Manual{
 const result={...next};
 if(next.status==='published'||next.publicationSuppressed){delete result.publishedSnapshot;return result;}
 const released=previous&&(previous.status==='published'?previous:previous.publishedSnapshot);
 if(released&&released.approvedBy&&released.id===next.id&&released.organizationId===next.organizationId&&released.siteId===next.siteId){const {publishedSnapshot,publicationSuppressed,...snapshot}=released;result.publishedSnapshot=snapshot;}else delete result.publishedSnapshot;
 return result;
}
export function publicManual(manual:Manual):Manual{
 // Explicit allowlist: newly added internal fields never leak automatically.
 const guide=(program:NonNullable<Manual['program']>)=>({...program,blocks:program.blocks.map(block=>({...block,sourceMessageIds:[],...(block.type==='step'?{authorizationSourceMessageIds:[]}:{})}))});
 return {id:manual.id,organizationId:manual.organizationId,siteId:manual.siteId,content:manual.content,translations:manual.translations,languages:manual.languages,
  sourceQuestionIds:[],status:'published',approvedBy:null,imageUrls:manual.imageUrls,createdAt:manual.createdAt,updatedAt:manual.updatedAt,confidentiality:manualAccess(manual)?.level??'RESTRICTED',...(manual.kind?{kind:manual.kind}:{}),
  revision:manual.revision,...(manual.sourceDocument?.share?{sourceDocument:{...manual.sourceDocument}}:{}),...(manual.consultationType?{consultationType:manual.consultationType}:{}),...(manual.riskLevel?{riskLevel:manual.riskLevel}:{}),...(manual.program?{program:guide(manual.program)}:{}),...(manual.programTranslations?{programTranslations:Object.fromEntries(Object.entries(manual.programTranslations).map(([language,program])=>[language,guide(program!)]))}:{}),...(manual.figures?{figures:manual.figures}:{}),...(manual.imageLayout?{imageLayout:manual.imageLayout}:{})};
}
