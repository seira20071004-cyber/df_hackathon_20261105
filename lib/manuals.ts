import {generateChecked,illustrate} from './ai';
import type {Manual,Profile,Question} from './model';
import {mutate} from './storage';
import {generationContext,INTERACTIVE_PROMPT_VERSION,runInteractiveGeneration} from './interactive-generation';
import {programContent} from './manual-graph';
import {protectAiData,publicationInspection,safeToPublish} from './privacy';
import {digest} from './security-content';
import {publicationHash,publicationPayload} from './publication';
import {audit,securityContext} from './security-runtime';

export const generationRunning=(manual:Manual)=>Boolean(manual.generation&&['queued','analyzing','checking_gaps','writing','validating','illustrating'].includes(manual.generation.state)&&Date.now()-Date.parse(manual.generation.startedAt)<300_000);
export async function buildManual(profile:Profile,draft:Manual,question:Question|undefined,imagesOnly:boolean){
  return securityContext.run(profile,()=>buildProtectedManual(profile,draft,question,imagesOnly));
}
async function buildProtectedManual(profile:Profile,draft:Manual,question:Question|undefined,imagesOnly:boolean){
  const attemptId=draft.generation?.attemptId;if(!attemptId)return;
  async function update(change:Partial<Manual>){return mutate(profile,draft.siteId,'manuals',draft.id,current=>{
    if(!current)throw new Error('source-missing');
    if(current.status!=='draft'||current.generation?.attemptId!==attemptId||current.updatedAt!==draft.updatedAt)throw new Error('obsolete-attempt');
    return {...current,...change};
  });}
  const status=(state:NonNullable<Manual['generation']>['state'],error?:string)=>({state,attemptId,startedAt:draft.generation!.startedAt,...(error?{error}:{})});
  try{
    if(draft.access?.level==='RESTRICTED')throw new Error('restricted-manual');
    if(imagesOnly){
      await update({generation:status('illustrating')});const image=await illustrate(draft.content.steps);
      await update({imageUrls:image.images,imageLayout:'steps',reviewState:'pending_approval',generation:status(image.images.length===draft.content.steps.length?'ready':'failed',image.error),updatedAt:new Date().toISOString()});return;
    }
    if(!question)throw new Error('source-missing');
    const answers=draft.clarification?.answers??[],raw=generationContext(profile,question,answers),context=await protectAiData(raw.context),hash=digest(context),bytes=Buffer.byteLength(JSON.stringify(context));
    let pipeline:NonNullable<Manual['pipeline']>={promptVersion:INTERACTIVE_PROMPT_VERSION,contextHash:hash,contextBytes:bytes,messageCount:context.sources.length,
      provider:process.env.GEMINI_PROVIDER==='vertex'?'vertex':'developer',model:process.env.GEMINI_MODEL||'gemini-2.5-flash',verification:'pending',issues:[],factCount:0,supersededCount:0};
    await update({pipeline});
    const result=await runInteractiveGeneration({context,call:generateChecked,round:draft.clarification?.round??0,
      previousQuestions:draft.clarification?.previousQuestions??[],answers,onStage:async state=>{await update({generation:status(state)});}});
    pipeline={...pipeline,factCount:result.extraction.facts.filter(fact=>fact.status==='current').length,
      supersededCount:result.extraction.facts.filter(fact=>fact.status==='superseded').length,
      facts:result.extraction.facts.map(fact=>({id:fact.id,kind:fact.kind,text:fact.text,status:fact.status,messageIds:[...new Set(fact.evidence.map(source=>source.messageId))]})),
      verification:result.state==='ready'?'passed':'blocked',issues:result.issues,...(result.state==='ready'?{verifiedAt:new Date().toISOString()}:{})};
    const common:Partial<Manual>={pipeline,extraction:result.extraction,quality:{...(result.report?{report:result.report}:{}),issues:result.issues,repairs:result.repairs}};
    if(result.state==='awaiting_answers'){
      await update({...common,reviewState:'awaiting_answers',clarification:{round:(draft.clarification?.round??0)+1,questions:result.questions,
        previousQuestions:[...(draft.clarification?.previousQuestions??[]),...result.questions],answers},generation:status('awaiting_answers'),updatedAt:new Date().toISOString()});return;
    }
    if(result.state==='held'){
      await update({...common,reviewState:'held',generation:status('held','review-required'),updatedAt:new Date().toISOString()});return;
    }
    const program=result.program!,content=programContent(program);
    const evidenceFor=(ids:string[])=>result.extraction.facts.filter(fact=>fact.status==='current').flatMap(fact=>fact.evidence).filter(source=>ids.includes(source.messageId)).slice(0,4);
    const evidence={steps:program.blocks.filter(block=>block.type==='step').map(block=>evidenceFor(block.sourceMessageIds)),
      cautions:program.blocks.filter(block=>block.type==='warning').map(block=>evidenceFor(block.sourceMessageIds))};
    let imageUrls:string[]=[],imageError:string|undefined;
    if(process.env.GEMINI_GENERATE_IMAGES==='true'){
      await update({...common,program,content,evidence,generation:status('illustrating')});
      const image=await illustrate(content.steps);imageUrls=image.images;imageError=image.error;
    }
    const at=new Date().toISOString(),revision=(draft.revision??1)+1;
    const candidate={...draft,program,content,translations:{},programTranslations:{},imageUrls,languages:['ja'] as Manual['languages']};
    const inspection=await publicationInspection(publicationPayload(candidate));
    if(!safeToPublish(inspection)){await update({...common,program,content,imageUrls,reviewState:'held',security:{inspection,contentHash:publicationHash(candidate),checkedAt:at},generation:status('held','privacy-review'),updatedAt:at});return;}
    await update({...common,program,content,evidence,programTranslations:{},translations:{},languages:['ja'],imageUrls,imageLayout:'steps',reviewState:'pending_approval',revision,
      security:{inspection,contentHash:publicationHash(candidate),checkedAt:at},clarification:{round:draft.clarification?.round??0,questions:[],previousQuestions:draft.clarification?.previousQuestions??[],answers},
      audit:[...(draft.audit??[]),{revision,at,actor:'Gemini',action:'generated' as const,changes:['対話型マニュアルを構成・検証']}].slice(-30),
      generation:status(imageError?'failed':'ready',imageError),updatedAt:at});
    await audit({actorId:profile.id,organizationId:profile.organizationId,action:'manual_generated',result:'success',resourceId:draft.id});
  }catch(error){
    const message=error instanceof Error?error.message:'provider-error';if(message==='obsolete-attempt')return;
    const code=['restricted-manual','context-limit','context-scope','source-not-resolved','source-missing','not-configured','quota','prepay','access-denied','generation-timeout','invalid-json','privacy-unavailable','sensitive-input-blocked','sensitive-output','rate-limited','secret-invalid','secret-access-denied','secret-unavailable','secret-manager-required'].includes(message)?message:'provider-error';
    await update({reviewState:'held',generation:status('failed',code),updatedAt:new Date().toISOString()}).catch(()=>undefined);
    await audit({actorId:profile.id,organizationId:profile.organizationId,action:'manual_generation',result:'failed',code,resourceId:draft.id}).catch(()=>undefined);
  }
}
