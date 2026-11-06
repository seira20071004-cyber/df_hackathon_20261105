import { z } from 'zod';
import { generate, illustrate } from './ai';
import type { Manual, Profile, Question } from './model';
import { mutate } from './storage';

const citation = z.object({messageId: z.string().max(120), quote: z.string().min(1).max(1500)});
const item = z.object({text: z.string().trim().min(1).max(500), evidence: z.array(citation).min(1).max(4)});
const extraction = z.object({
  title: z.string().trim().min(1).max(250),
  steps: z.array(item).min(1).max(8),
  cautions: z.array(item).max(8)
});
export const generationRunning = (manual: Manual) => Boolean(manual.generation &&
  ['queued','writing','illustrating'].includes(manual.generation.state) &&
  Date.now() - Date.parse(manual.generation.startedAt) < 180_000);

export async function buildManual(profile: Profile, draft: Manual, question: Question | undefined, imagesOnly: boolean) {
  const attemptId = draft.generation?.attemptId;
  if (!attemptId) return;
  async function update(change: Partial<Manual>) {
    return mutate(profile, draft.siteId, 'manuals', draft.id, current => {
      if (!current) throw new Error('Missing manual');
      if (current.generation?.attemptId !== attemptId || current.updatedAt !== draft.updatedAt || current.status !== 'draft') return current;
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
      await update({generation: status('writing')});
      const conversation = question.messages.map(message => ({
        id: message.id, role: message.role, original: message.originalText,
        japanese: message.role === 'employee' ? message.translatedText : message.originalText
      }));
      const result = await generate(extraction,
        'あなたは現場マニュアルの編集者です。相談の質問と管理者が最終的に回答した内容から、別のスタッフが同じ現場で再利用できる日本語マニュアルを作ります。' +
        'title は質問内容を短く具体的に表し、steps は質問に答えるために必要な確定済みの対処法を作業順に1項目1動作で記述してください。挨拶、雑談、途中で訂正された回答、重複、個人名は除きます。' +
        '数量・場所・対象範囲・条件は原文のまま保持してください。必要な作業情報が会話にない場合は新しい方法を補わないでください。' +
        '各項目に根拠となる管理者メッセージの id と、その original からの一字一句一致する引用 quote を必ず添えてください。' +
        'cautions は管理者が明記した注意や禁止事項だけです。注意の発言がなければ空配列にします。一般的な安全知識の追加は禁止です。',
        {question: question.japaneseText || question.originalText, conversation, resolution: question.resolution});
      if (!result) {await update({generation: status('failed',process.env.GEMINI_API_KEY ? 'text-unavailable' : 'not-configured')}); return;}
      const sourceMessages = new Map(question.messages.filter(message => message.role === 'manager').map(message => [message.id,message.originalText]));
      const grounded = (entry: z.infer<typeof item>) => entry.evidence.every(source =>
        sourceMessages.get(source.messageId)?.includes(source.quote));
      if (![...result.steps,...result.cautions].every(grounded)) {
        await update({generation: status('failed','unverified-source')}); return;
      }
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
  } catch {
    await update({generation: status('failed','provider-error')}).catch(() => undefined);
  }
}

