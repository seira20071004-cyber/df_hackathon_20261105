export const languages = ['ja', 'en', 'vi'] as const;
export type Language = typeof languages[number];
export type Role = 'employee' | 'manager';
export interface Profile {
  id: string;
  name: string;
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
  generation?: {
    state: 'queued' | 'analyzing' | 'writing' | 'validating' | 'illustrating' | 'ready' | 'failed';
    attemptId: string;
    startedAt: string;
    error?: string;
  };
  evidence?: {
    steps: {messageId: string; quote: string}[][];
    cautions: {messageId: string; quote: string}[][];
  };
  imageLayout?: 'steps';
  pipeline?: {
    promptVersion:string;
    contextHash:string;
    contextBytes:number;
    messageCount:number;
    provider:'vertex'|'developer';
    model:string;
    factCount:number;
    supersededCount:number;
    facts?:{id:string;kind:'action'|'scope'|'condition'|'caution';text:string;status:'current'|'superseded';messageIds:string[]}[];
    verification:'pending'|'passed'|'blocked'|'edited';
    issues:string[];
    verifiedAt?:string;
  };
}
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
export interface Workspace {
  profile: Profile;
  demo: boolean;
  ai: boolean;
  questions: Question[];
  manuals: Manual[];
}
export const languageNames = {ja: '日本語', en: 'English', vi: 'Tiếng Việt'};
export const categories = ['階段', '洗剤', 'ごみ', '写真', '汚れ', 'その他'] as const;
export function topic(text: string) {
  const patterns = [/階段|階段室|stair|cầu thang/iu, /洗剤|detergent|cleaning product|chất tẩy|nước lau/iu, /ゴミ|ごみ|trash|garbage|waste|rác/iu, /写真|photo|ảnh/iu, /汚れ|stain|vết bẩn/iu];
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
