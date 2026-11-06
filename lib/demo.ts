import { topic, type Manual, type Profile, type Question } from './model.ts';

const scope = {organizationId: 'demo', siteId: 'sakura'};
export const demoProfiles: Record<string, Profile> = Object.fromEntries([
  {id: 'linh', name: 'Linh Nguyễn', role: 'employee', preferredLanguage: 'vi'},
  {id: 'alex', name: 'Alex Smith', role: 'employee', preferredLanguage: 'en'},
  {id: 'sato', name: '佐藤 美咲', role: 'manager', preferredLanguage: 'ja'}
].map(profile => [profile.id, {...profile,companyName:'Bridge Work デモ株式会社', organizationId: scope.organizationId, siteIds: [scope.siteId]} as Profile]));

export const examples = [
  ['階段の清掃範囲はどこまでですか？', 'Which floors of the staircase should I clean?', 'Tôi cần dọn cầu thang từ tầng nào đến tầng nào?', 'このデモ現場では、1階から3階までの階段と踊り場が対象です。', 'At this demo site, clean the stairs and landings from floors 1 through 3.', 'Tại địa điểm demo này, hãy dọn cầu thang và chiếu nghỉ từ tầng 1 đến tầng 3.'],
  ['洗剤はどこに保管されていますか？', 'Where is the detergent stored?', 'Chất tẩy rửa được cất ở đâu?', 'デモ現場の洗剤は1階の清掃用具室にあります。', 'The demo site detergent is in the ground-floor cleaning supply room.', 'Chất tẩy rửa nằm trong phòng dụng cụ vệ sinh ở tầng 1 của địa điểm demo.'],
  ['ゴミはどこに集めればいいですか？', 'Where should I collect the trash?', 'Tôi nên gom rác ở đâu?', 'デモ現場では1階の指定集積場所に集めます。', 'Use the designated collection point on the first floor of the demo site.', 'Hãy gom rác tại điểm tập kết quy định ở tầng 1 của địa điểm demo.'],
  ['清掃後の写真は何枚必要ですか？', 'How many photos do I need after cleaning?', 'Sau khi dọn dẹp cần chụp bao nhiêu ảnh?', 'デモ現場では作業後の写真を1枚提出してください。', 'Submit one photo after cleaning at the demo site.', 'Hãy gửi một ảnh sau khi dọn dẹp tại địa điểm demo.'],
  ['汚れが落ちない場合はどうすればいいですか？', 'What if a stain will not come off?', 'Tôi phải làm gì nếu không tẩy được vết bẩn?', '作業を中断し、デモ現場の管理者に確認してください。', 'Stop the task and check with the demo site manager.', 'Hãy dừng công việc và hỏi người quản lý tại địa điểm demo.']
];
export function seedDemo() {
  const date = '2025-11-05T00:00:00.000Z';
  const questions: Question[] = examples.map(([originalText,,, answer], index) => ({
    ...scope, id: 'sample-' + index, employeeId: 'alex', originalText, originalLanguage: 'ja',
    japaneseText: originalText, summary: '', category: topic(originalText), status: 'resolved', approvedForReuse: true,
    createdAt: date, resolvedAt: date, resolution: answer, references: [],
    messages: [{id: 'reply-' + index, role: 'manager', senderId: 'sato', originalText: answer, translatedText: answer, targetLanguage: 'ja', createdAt: date}]
  }));
  questions.push({...questions[0], id: 'sample-new', originalText: '入口マットの交換時期を教えてください。', japaneseText: '入口マットの交換時期を教えてください。', category: 'その他', status: 'new', approvedForReuse: false, resolvedAt: null, resolution: '', messages: []});
  const manuals: Manual[] = [{
    ...scope, id: 'sample-manual', sourceQuestionIds: ['sample-0'], status: 'published',
    approvedBy: 'sato', languages: ['ja', 'en', 'vi'], imageUrls: [], createdAt: date, updatedAt: date,
    content: {title: '階段はどこまで掃除しますか？', task: '階段清掃', purpose: '清掃の担当範囲を確認する', tools: [], steps: ['1階から3階までの階段が対象です', '各階の踊り場も清掃します'], cautions: [], mistakes: [], checks: ['階段と踊り場を確認した']},
    translations: {
      en: {title: 'Which stairs should I clean?', task: 'Stair cleaning', purpose: 'Check your assigned area', tools: [], steps: ['Clean stairs from floors 1 to 3', 'Include the landings on each floor'], cautions: [], mistakes: [], checks: ['Stairs and landings checked']},
      vi: {title: 'Tôi cần dọn cầu thang ở những tầng nào?', task: 'Vệ sinh cầu thang', purpose: 'Xác nhận khu vực được giao', tools: [], steps: ['Dọn cầu thang từ tầng 1 đến tầng 3', 'Dọn cả các chiếu nghỉ ở mỗi tầng'], cautions: [], mistakes: [], checks: ['Đã kiểm tra cầu thang và chiếu nghỉ']}
    }
  }];
  return {questions, manuals};
}
export function demoTranslation(value: string, target: 'ja' | 'en' | 'vi') {
  const column = {ja: 0, en: 1, vi: 2}[target];
  for (const row of examples) {
    if (row.slice(0, 3).includes(value)) return row[column];
    if (row.slice(3).includes(value)) return row[column + 3];
  }
  return '';
}
