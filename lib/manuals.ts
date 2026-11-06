import { aiConfigured, generate, illustrate } from './ai';
import type { Manual, Profile, Question } from './model';
import { mutate } from './storage';
import { citedByManager, extractionSchema, factSchema, manualContext, PROMPT_VERSION, prompts, verificationIssues, verificationSchema } from './manual-pipeline';

export const generationRunning = (manual: Manual) => Boolean(manual.generation &&
  ['queued','analyzing','writing','validating','illustrating'].includes(manual.generation.state) &&
  Date.now() - Date.parse(manual.generation.startedAt) < 300_000);

export async function buildManual(profile: Profile, draft: Manual, question: Question | undefined, imagesOnly: boolean) {
  const attemptId = draft.generation?.attemptId;
  if (!attemptId) return;
  async function update(change: Partial<Manual>) {
    return mutate(profile, draft.siteId, 'manuals', draft.id, current => {
      if (!current) throw new Error('Missing manual');
      if (current.generation?.attemptId !== attemptId || current.updatedAt !== draft.updatedAt || current.status !== 'draft') throw new Error('obsolete-attempt');
      return {...current, ...change};
    });
  }
  const status = (state: NonNullable<Manual['generation']>['state'], error?: string): Manual['generation'] => ({
    attemptId, startedAt: draft.generation!.startedAt, state, ...(error ? {error} : {})
  });
  try {
    let content = draft.content;
    let evidence = draft.evidence;
    if (!imagesOnly) {
      if (!question) {await update({generation: status('failed','source-missing')}); return;}
      const {context,hash,bytes}=manualContext(profile,question);
      let pipeline:NonNullable<Manual['pipeline']>={promptVersion:PROMPT_VERSION,contextHash:hash,contextBytes:bytes,
        messageCount:context.conversation.length,provider:process.env.GEMINI_PROVIDER==='vertex'?'vertex':'developer',
        model:process.env.GEMINI_MODEL || 'gemini-2.5-flash',verification:'pending',issues:[],factCount:0,supersededCount:0};
      await update({pipeline,generation:status('analyzing')});
      const facts=await generate(factSchema,prompts.facts,context);
      if(!facts) {await update({generation:status('failed','text-unavailable')});return;}
      if(!citedByManager(question,facts.facts) || new Set(facts.facts.map(fact=>fact.id)).size!==facts.facts.length) {
        await update({generation:status('failed','unverified-source')});return;
      }
      pipeline={...pipeline,factCount:facts.facts.filter(fact=>fact.status==='current').length,
        supersededCount:facts.facts.filter(fact=>fact.status==='superseded').length,
        facts:facts.facts.map(fact=>({id:fact.id,kind:fact.kind,text:fact.text,status:fact.status,messageIds:[...new Set(fact.evidence.map(source=>source.messageId))]}))};
      if(facts.unresolved.length || !pipeline.factCount) {
        await update({pipeline:{...pipeline,verification:'blocked',issues:facts.unresolved.length ? facts.unresolved : ['管理者の確定回答がありません']},
          generation:status('failed','context-unresolved')});return;
      }
      await update({pipeline,generation:status('writing')});
      const currentFacts=facts.facts.filter(fact=>fact.status==='current');
      const result = await generate(extractionSchema,prompts.compose,{question:context.question,facts:currentFacts});
      if (!result) {await update({generation: status('failed',aiConfigured() ? 'text-unavailable' : 'not-configured')}); return;}
      if (!citedByManager(question,[...result.steps,...result.cautions]) ||
        [...result.steps,...result.cautions].some(entry=>entry.evidence.some(source=>!currentFacts.some(fact=>
          fact.evidence.some(citation=>citation.messageId===source.messageId && citation.quote===source.quote)))) ||
        (result.cautions.length>0 && !currentFacts.some(fact=>fact.kind==='caution'))) {
        await update({generation: status('failed','unverified-source')}); return;
      }
      await update({generation:status('validating')});
      const report=await generate(verificationSchema,prompts.verify,{context,facts,candidate:result});
      if(!report) {await update({generation:status('failed','verification-unavailable')});return;}
      const issues=verificationIssues(result,report);
      pipeline={...pipeline,verification:issues.length?'blocked':'passed',issues,verifiedAt:new Date().toISOString()};
      await update({pipeline});
      if(issues.length) {await update({generation:status('failed','semantic-mismatch')});return;}
      content = {...draft.content, title: result.title, task: result.title, purpose: result.title,
        steps: result.steps.map(step => step.text), cautions: result.cautions.map(caution => caution.text)};
      evidence = {steps: result.steps.map(step => step.evidence), cautions: result.cautions.map(caution => caution.evidence)};
    }
    if (content.steps.some(step => step.includes('管理者による確認が必要'))) {
      await update({generation: status('failed','source-missing')}); return;
    }
    await update({content, ...(evidence ? {evidence} : {}), imageUrls: [], imageLayout: 'steps', generation: status('illustrating')});
    const result = await illustrate(content.steps);
    await update({content, ...(evidence ? {evidence} : {}), imageUrls: result.images, imageLayout: 'steps',
      generation: status(result.images.length === content.steps.length ? 'ready' : 'failed', result.error),
      updatedAt: new Date().toISOString()});
  } catch(error) {
    if(!(error instanceof Error && error.message==='obsolete-attempt'))
      console.error('Manual generation failed',error instanceof Error?error.name:'UnknownError',(error as NodeJS.ErrnoException | null)?.code,(error as NodeJS.ErrnoException | null)?.syscall);
    const code=error instanceof Error && ['context-limit','context-scope'].includes(error.message)?error.message:'provider-error';
    await update({generation: status('failed',code)}).catch(() => undefined);
  }
}

