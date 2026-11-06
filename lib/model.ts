import type {AdditionalAnswer,ExtractedChat,GapQuestion,ManualProgram,QualityReport} from './manual-graph';
export const languages = ['ja', 'en', 'vi'] as const;
export type Language = typeof languages[number];
export type Role = 'employee' | 'manager';
export interface Profile {
  id: string;
  name: string;
  companyName?:string;
  role: Role;
  organizationId: string;
  siteIds: string[];
  preferredLanguage: Language;
}
export interface Message {
  id: string;
  senderId: string;
  role: Role;
  originalText: string;
  translatedText: string;
  targetLanguage: Language;
  createdAt: string;
}
export interface Question {
  id: string;
  organizationId: string;
  siteId: string;
  employeeId: string;
  originalText: string;
  originalLanguage: Language;
  japaneseText: string;
  category: string;
  summary: string;
  status: 'new' | 'active' | 'resolved';
  approvedForReuse: boolean;
  createdAt: string;
  resolvedAt: string | null;
  resolution: string;
  references: Match[];
  messages: Message[];
}
export interface ManualContent {
  title: string;
  task: string;
  purpose: string;
  tools: string[];
  steps: string[];
  cautions: string[];
  mistakes: string[];
  checks: string[];
}
export interface Manual {
  id: string;
  organizationId: string;
  siteId: string;
  content: ManualContent;
  translations: Partial<Record<Language, ManualContent>>;
  languages: Language[];
  sourceQuestionIds: string[];
  status: 'draft' | 'published';
  approvedBy: string | null;
  imageUrls: string[];
  createdAt: string;
  updatedAt: string;
  revision?:number;
  approvedAt?:string|null;
  reviewState?:'awaiting_answers'|'pending_approval'|'held'|'rejected';
  publishedSnapshot?:Manual;
  publicationSuppressed?:boolean;
  security?:{contentHash:string;inspection:import('./security-content').Inspection;checkedAt:string};
  program?:ManualProgram;
  programTranslations?:Partial<Record<Language,ManualProgram>>;
  extraction?:ExtractedChat;
  clarification?:{round:number;questions:GapQuestion[];previousQuestions:GapQuestion[];answers:AdditionalAnswer[]};
  quality?:{report?:QualityReport;issues:string[];repairs:number};
  audit?:{revision:number;at:string;actor:string;action:'generated'|'edited'|'published'|'unpublished'|'held'|'rejected';changes:string[]}[];
  embedding?:{model:string;hash:string;values:number[]};
  generation?: {
    state: 'queued' | 'analyzing' | 'checking_gaps' | 'writing' | 'validating' | 'illustrating' | 'awaiting_answers' | 'held' | 'ready' | 'failed';
    attemptId: string;
    startedAt: string;
    error?: string;
  };
  evidence?: {
    steps: {messageId: string; quote: string}[][];
    cautions: {messageId: string; quote: string}[][];
  };
  imageLayout?: 'steps';
  figures?: ManualFigure[];
  pipeline?: {
    promptVersion:string;
    contextHash:string;
    contextBytes:number;
    messageCount:number;
    provider:'vertex'|'developer';
    model:string;
    factCount:number;
    supersededCount:number;
    facts?:{id:string;kind:ExtractedChat['facts'][number]['kind']|'caution';text:string;status:'current'|'superseded';messageIds:string[]}[];
    verification:'pending'|'passed'|'blocked'|'edited';
    issues:string[];
    verifiedAt?:string;
  };
}
export interface ManualFigure {id:string;afterStep:number;url:string;caption:string;}
export interface ManualEdits {stepSources:number[];figures:ManualFigure[];}
export interface StairRange {
  kind: 'stair-range';
  fromFloor: number;
  toFloor: number;
  includeLandings: boolean;
}
export interface Match {
  id: string;
  kind: 'question' | 'manual';
  siteId: string;
  title: string;
  answer: string;
  resolution: string;
  manualIds: string[];
  version?: string;
}
export interface ManualView {
  id: string;
  organizationId: string;
  siteId: string;
  employeeId: string;
  manualId: string;
  version: string;
}
export interface ManualDelivery {
  id:string;organizationId:string;siteId:string;manualId:string;version:string;
  employeeId:string;sentBy:string;createdAt:string;readAt:string|null;
}
export interface ManualUse {id:string;organizationId:string;siteId:string;manualId:string;version:string;employeeId:string;runId:string;
  outcome:'started'|'resolved'|'unresolved';path:string[];createdAt:string;finishedAt:string|null;questionId:string|null;}
export type StaffRecipient=Pick<Profile,'id'|'name'|'siteIds'>;
export interface Workspace {
  profile: Profile;
  demo: boolean;
  ai: boolean;
  questions: Question[];
  manuals: Manual[];
  staff:StaffRecipient[];
  deliveries:ManualDelivery[];
  manualStats:Record<string,{uses:number;resolved:number;unresolved:number}>;
}
export const languageNames = {ja: '日本語', en: 'English', vi: 'Tiếng Việt'};
export const categories = ['安全','作業範囲','数量・記録','場所・保管','設備・操作','備品・材料','その他'] as const;
export function topic(text: string) {
  const patterns = [/危険|禁止|けが|事故|danger|injur|nguy hiểm|cấm/iu,/範囲|どこまで|何階|対象|which floor|how far|phạm vi|tầng nào/iu,
    /何枚|何個|いくつ|写真|記録|how many|photo|bao nhiêu|ảnh/iu,/どこ|場所|保管|where|stored|location|ở đâu|cất/iu,
    /機械|設備|電源|バーコード|レジ|階段|scan|machine|power|stair|cầu thang|máy/iu,/材料|道具|備品|洗剤|ごみ|ゴミ|suppl|material|detergent|garbage|rác|chất tẩy/iu];
  const index = patterns.findIndex(pattern => pattern.test(text));
  return index < 0 ? 'その他' : categories[index];
}
export function isScoped(profile: Profile, record: {organizationId: string; siteId: string}) {
  return profile.organizationId === record.organizationId && profile.siteIds.includes(record.siteId);
}
export function mayReadQuestion(profile: Profile, question: Question) {
  return isScoped(profile, question) && (profile.role === 'manager' || question.employeeId === profile.id);
}
export function mayReuse(question: Question) {
  return question.status === 'resolved' && question.approvedForReuse;
}
export function mayReadManual(profile: Profile, manual: Manual) {
  return isScoped(profile, manual) && (profile.role === 'manager' || manual.status === 'published');
}
