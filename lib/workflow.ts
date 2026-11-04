import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { generate, manualContent, relevance, summarize, translate } from './ai';
import { isScoped, languageNames, languages, mayReadManual, mayReadQuestion, mayReuse, topic, type Language, type Manual, type Match, type Profile, type Question } from './model';
import { isDemo, list, mutate, resolveWithManual, setLanguage, slug } from './storage';

const text = z.string().trim().min(1).max(3000);
const location = {siteId: slug};
const record = {...location, id: slug};
export const actionSchema = z.discriminatedUnion('action', [
  z.object({action: z.literal('language'), language: z.enum(languages)}),
  z.object({action: z.literal('search'), ...location, text, language: z.enum(languages)}),
  z.object({action: z.literal('ask'), ...location, text, language: z.enum(languages), id: z.uuid()}),
  z.object({action: z.literal('reply'), ...record, text, messageId: z.uuid()}),
  z.object({action: z.literal('resolve'), ...record, text}),
  z.object({action: z.literal('reuse'), ...record, approved: z.boolean()}),
  z.object({action: z.literal('selfResolve'), ...location, text, language: z.enum(languages), matchId: slug, kind: z.enum(['question','manual']), id: z.uuid()}),
  z.object({action: z.literal('viewManual'), ...record, version: z.string().max(40)}),
  z.object({action: z.literal('saveManual'), ...record, content: manualContent, publish: z.boolean(), version: z.string().max(40)})
]);
export type Action = z.infer<typeof actionSchema>;
export class ApiError extends Error {
  constructor(public status: number, message: string) {super(message);}
}
const date = () => new Date().toISOString();
const newest = <T extends {createdAt: string}>(rows: T[]) => rows.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
function assertRole(profile: Profile, role: Profile['role']) {
  if (profile.role !== role) throw new ApiError(403, 'forbidden');
}
async function loadSite(profile: Profile, siteId: string) {
  const [questions, manuals] = await Promise.all([list(profile, siteId, 'questions'), list(profile, siteId, 'manuals')]);
  return {questions: newest(questions.filter(row => isScoped(profile, row))), manuals: newest(manuals.filter(row => isScoped(profile, row)))};
}
export async function workspace(profile: Profile) {
  const sites = await Promise.all(profile.siteIds.map(async siteId => {
    const site = await loadSite(profile, siteId);
    if (profile.role === 'manager') return site;
    const viewed = (await list(profile, siteId, 'manualViews')).filter(view => isScoped(profile, view) && view.employeeId === profile.id);
    const legacyReferences = site.questions.filter(question => question.employeeId === profile.id)
      .flatMap(question => question.references).filter(reference => reference.kind === 'manual' && !reference.version);
    return {...site, manuals: site.manuals.filter(manual => mayReadManual(profile, manual) &&
      (viewed.some(view => view.manualId === manual.id && view.version === manual.updatedAt) ||
        legacyReferences.some(reference => reference.id === manual.id)))};
  }));
  return {profile, demo: isDemo(), ai: Boolean(process.env.GEMINI_API_KEY),
    questions: newest(sites.flatMap(site => site.questions.filter(row => mayReadQuestion(profile,row)))),
    manuals: newest(sites.flatMap(site => site.manuals.filter(row => mayReadManual(profile,row))))};
}
function candidates(questions: Question[], manuals: Manual[]): Match[] {
  const published = manuals.filter(manual => manual.status === 'published');
  return [
    ...questions.filter(mayReuse).map(question => ({
      id: question.id, kind: 'question' as const, siteId: question.siteId,
      title: question.japaneseText || question.originalText,
      answer: question.messages.filter(message => message.role === 'manager').at(-1)?.originalText || question.references[0]?.answer || '',
      resolution: question.resolution,
      manualIds: published.filter(manual => manual.sourceQuestionIds.includes(question.id)).map(manual => manual.id)
    })),
    ...published.map(manual => ({id: manual.id, kind: 'manual' as const, siteId: manual.siteId, title: manual.content.title,
      answer: manual.content.purpose, resolution: '', manualIds: [manual.id], version: manual.updatedAt}))
  ];
}
function matchKey(match: Match) {return match.kind + '/' + match.id;}
async function makeQuestion(profile: Profile, siteId: string, id: string, originalText: string, originalLanguage: Language): Promise<Question> {
  const japaneseText = await translate(originalText, originalLanguage, 'ja', isDemo());
  return {id, organizationId: profile.organizationId, siteId, employeeId: profile.id, originalText, originalLanguage, japaneseText,
    category: topic(japaneseText || originalText), summary: await summarize(japaneseText), status: 'new',
    approvedForReuse: false, createdAt: date(), resolvedAt: null, resolution: '', messages: [], references: []};
}
async function createDraft(question: Question, resolution: string): Promise<Manual> {
  const unknown = '管理者による確認が必要';
  const title = (question.japaneseText || question.originalText).slice(0, 500);
  const replies = question.messages.filter(message => message.role === 'manager').map(message => message.originalText);
  const content = await generate(manualContent,
    '相談の会話と解決内容をもとに日本語で図解用の作業マニュアルを作成してください。steps は図解の各カードに表示する短い手順です。会話にない方法・安全ルールや個人情報は含めず、不明なら「管理者による確認が必要」としてください。',
    {question: title, conversation: question.messages.map(message => ({
      role: message.role, text: message.role === 'employee' ? message.translatedText || message.originalText : message.originalText
    })), resolution}) ?? {
    title, task: question.category === 'その他' ? title : question.category, purpose: unknown, tools: [],
    steps: [...new Set(replies.filter(reply => reply.length <= 500))].slice(-11).concat([unknown]),
    cautions: [], mistakes: [], checks: [resolution.slice(0, 500)]
  };
  const createdAt = date();
  return {id: randomUUID(), organizationId: question.organizationId, siteId: question.siteId, content, translations: {},
    languages: ['ja'], sourceQuestionIds: [question.id], status: 'draft', approvedBy: null, imageUrls: [], createdAt, updatedAt: createdAt};
}
export async function execute(profile: Profile, input: Action) {
  if (input.action === 'language') {
    await setLanguage(profile, input.language);
    return {ok: true};
  }
  if (!profile.siteIds.includes(input.siteId)) throw new ApiError(403, 'forbidden');
  const {siteId} = input;
  if (input.action === 'ask' || input.action === 'selfResolve') {
    assertRole(profile, 'employee');
    const question = await makeQuestion(profile, siteId, input.id, input.text, input.language);
    if (input.action === 'selfResolve') {
      const {questions, manuals} = await loadSite(profile, siteId);
      const match = candidates(questions, manuals).find(row => row.kind === input.kind && row.id === input.matchId);
      if (!match) throw new ApiError(404, 'not-found');
      if (match.kind === 'manual' && !(await list(profile, siteId, 'manualViews')).some(view =>
        isScoped(profile, view) && view.employeeId === profile.id && view.manualId === match.id && view.version === match.version)) {
        throw new ApiError(404, 'not-found');
      }
      question.status = 'resolved';
      question.resolvedAt = date();
      question.resolution = match.resolution || match.answer;
      question.references = [match];
    }
    return mutate(profile, siteId, 'questions', input.id, previous => {
      if (previous && !mayReadQuestion(profile, previous)) throw new ApiError(404, 'not-found');
      return previous ?? question;
    });
  }
  const {questions, manuals} = await loadSite(profile, siteId);
  if (input.action === 'viewManual') {
    assertRole(profile, 'employee');
    const manual = manuals.find(row => row.id === input.id && mayReadManual(profile, row));
    if (!manual || manual.updatedAt !== input.version) throw new ApiError(404, 'not-found');
    const id = createHash('sha256').update(JSON.stringify([profile.id, manual.id])).digest('hex');
    await mutate(profile, siteId, 'manualViews', id, () => ({
      id, employeeId: profile.id, organizationId: profile.organizationId, siteId, manualId: manual.id, version: manual.updatedAt
    }));
    return manual;
  }
  if (input.action === 'search') {
    const matches = candidates([], manuals);
    const ranked = matches.map(match => ({match, score: relevance(input.text, match.title + ' ' + match.answer)}))
      .sort((a,b) => b.score - a.score);
    const pool = ranked.slice(0, 60).map(({match}) => match);
    const ids = pool.length ? await generate(z.object({ids: z.array(z.string()).max(3)}),
      '質問と意味や作業内容が近い候補を最大3件選んでください。無関係なら空配列。候補のキーをそのまま返してください。',
      {question: input.text, candidates: pool.map(match => ({id: matchKey(match), title: match.title, answer: match.answer}))}) : null;
    const result = ids ? [...new Set(ids.ids)].flatMap(id => pool.filter(match => matchKey(match) === id)) : ranked.filter(row => row.score >= 1).slice(0,3).map(row => row.match);
    return {matches: await Promise.all(result.map(async match => {
      const manual = manuals.find(row => row.id === match.id);
      const title = manual?.translations[input.language]?.title || (input.language === 'ja' ? match.title :
        await translate(match.title, 'ja', input.language, isDemo()) || match.title);
      return {...match, title, answer: ''};
    })), ai: Boolean(ids)};
  }
  if (input.action === 'reply' || input.action === 'resolve' || input.action === 'reuse') {
    const previous = questions.find(row => row.id === input.id && mayReadQuestion(profile,row));
    if (!previous) throw new ApiError(404, 'not-found');
    if (input.action === 'reuse') assertRole(profile, 'manager');
    if (input.action === 'resolve') {
      assertRole(profile, 'employee');
      if (previous.status === 'resolved') return previous;
      const manual = await createDraft(previous, input.text);
      return resolveWithManual(profile, siteId, manual, question => {
        if (!question || !mayReadQuestion(profile, question)) throw new ApiError(404, 'not-found');
        if (question.status === 'resolved') return question;
        if (question.messages.length !== previous.messages.length) throw new ApiError(409, 'conversation-updated');
        return {...question, status: 'resolved', resolvedAt: date(), resolution: input.text};
      });
    }
    const source = profile.role === 'manager' ? 'ja' : previous.originalLanguage;
    const target = profile.role === 'manager' ? previous.originalLanguage : 'ja';
    const translatedText = input.action === 'reply' ? await translate(input.text, source, target, isDemo()) : '';
    return mutate(profile, siteId, 'questions', input.id, question => {
      if (!question || !mayReadQuestion(profile, question)) throw new ApiError(404, 'not-found');
      if (input.action === 'reuse') {
        if (question.status !== 'resolved') throw new ApiError(409, 'open-question');
        return {...question, approvedForReuse: input.approved};
      }
      if (question.messages.some(message => message.id === input.messageId)) return question;
      if (question.status === 'resolved' || question.messages.length >= 50) throw new ApiError(409, 'closed-or-limit');
      const next: Question = {...question, status: profile.role === 'manager' ? 'active' : question.status, messages: [...question.messages, {
        id: input.messageId, senderId: profile.id, role: profile.role, originalText: input.text, translatedText, targetLanguage: target, createdAt: date()
      }]};
      if (Buffer.byteLength(JSON.stringify(next)) > 800_000) throw new ApiError(409, 'closed-or-limit');
      return next;
    });
  }
  assertRole(profile, 'manager');
  const previous = manuals.find(manual => manual.id === input.id);
  if (!previous) throw new ApiError(404, 'not-found');
  if (input.publish && input.content.steps.includes('管理者による確認が必要')) throw new ApiError(400, 'review-steps');
  const translations: Manual['translations'] = {};
  if (input.publish) {
    await Promise.all((['en','vi'] as const).map(async language => {
      const translation = await generate(manualContent, '元の構造と作業指示を変えずに翻訳してください。追加や省略は禁止です。', {language: languageNames[language], manual: input.content});
      if (translation) translations[language] = translation;
    }));
  }
  return mutate(profile, siteId, 'manuals', input.id, manual => {
    if (!manual || !isScoped(profile, manual)) throw new ApiError(404, 'not-found');
    if (manual.updatedAt !== input.version) throw new ApiError(409, 'stale-manual');
    return {...manual, content: input.content, translations, languages: ['ja', ...Object.keys(translations) as Language[]],
      status: input.publish ? 'published' : 'draft', approvedBy: input.publish ? profile.id : null, updatedAt: date()};
  });
}
