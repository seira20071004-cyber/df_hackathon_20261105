import { topic, type Manual, type Profile, type Question } from './model.ts';
import {programContent,type ManualProgram} from './manual-graph.ts';

const scope = {organizationId: 'demo', siteId: 'sakura'};
export const demoProfiles: Record<string, Profile> = Object.fromEntries([
  {id: 'linh', name: 'Linh Nguyễn', role: 'employee', preferredLanguage: 'vi'},
  {id: 'alex', name: 'Alex Smith', role: 'employee', preferredLanguage: 'en'},
  {id: 'sato', name: '佐藤 美咲', role: 'manager', preferredLanguage: 'ja'},
  {id: 'tanaka', name: '田中 健太', role: 'manager', preferredLanguage: 'ja'}
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
  const interactive=interactiveDemo();questions.push(interactive.question);manuals.push(interactive.manual);
  return {questions, manuals};
}
// Fictional, explicitly authored example. This is not a live Gemini result.
export function interactiveDemo(){
  const date='2026-11-06T00:00:00.000Z',source='demo-scanner-reply';
  const question:Question={...scope,id:'demo-scanner-chat',employeeId:'alex',originalText:'デモ用：商品を読み取っても登録されません。',originalLanguage:'ja',japaneseText:'デモ用：商品を読み取っても登録されません。',summary:'',category:'機器・設備',status:'resolved',approvedForReuse:true,createdAt:date,resolvedAt:date,resolution:'乾いた布で拭いた後に商品名が表示された',references:[],messages:[
    {id:source,role:'manager',senderId:'sato',originalText:'デモ用の操作例です。分解は禁止です。バーコードを目で確認してください。汚れていれば乾いた布で拭いてから読み取ってください。汚れていなければ別の商品を読み取ってください。商品名が画面に表示されれば解決です。表示されなければ管理者に連絡してください。',translatedText:'',targetLanguage:'ja',createdAt:date},
    {id:'demo-scanner-result',role:'employee',senderId:'alex',originalText:'乾いた布で拭いた後に商品名が表示されました。',translatedText:'',targetLanguage:'ja',createdAt:date}]};
  const step=(id:string,title:string,content:string,nextBlockId:string):ManualProgram['blocks'][number]=>({id,type:'step',title,content,supplement:'',nextBlockId,sourceMessageIds:[source],restricted:false,authorizationSourceMessageIds:[]});
  const program:ManualProgram={title:'【操作デモ】商品を読み取れないとき',description:'架空の操作例です。実際の現場で使う前に管理者が内容を確認してください。',language:'ja',startBlockId:'warning',blocks:[
    {id:'warning',type:'warning',content:'分解は禁止です。',severity:'notice',nextBlockId:'inspect',sourceMessageIds:[source]},
    step('inspect','バーコードを見る','バーコードに汚れがないか目で確認してください。','condition'),
    {id:'condition',type:'branch',question:'バーコードは汚れていますか？',choices:[{id:'yes',label:'はい、汚れています',nextBlockId:'wipe'},{id:'no',label:'いいえ、汚れていません',nextBlockId:'other'}],sourceMessageIds:[source]},
    step('wipe','乾いた布で拭く','汚れを乾いた布で拭いてください。','scan'),step('scan','もう一度読み取る','拭いた商品のバーコードを読み取ってください。','check'),
    step('other','別の商品を読み取る','別の商品のバーコードを読み取ってください。','check'),
    {id:'check',type:'check',content:'商品名が画面に表示されましたか？',successNextBlockId:null,failureNextBlockId:null,sourceMessageIds:[source]}]};
  const translated=(language:'en'|'vi',texts:string[]):ManualProgram=>({...structuredClone(program),language,title:texts[0],description:texts[1],blocks:program.blocks.map(block=>block.type==='step'?{...block,title:texts[2+['inspect','wipe','scan','other'].indexOf(block.id)*2],content:texts[3+['inspect','wipe','scan','other'].indexOf(block.id)*2]}:block.type==='warning'?{...block,content:texts[10]}:block.type==='branch'?{...block,question:texts[11],choices:block.choices.map((choice,index)=>({...choice,label:texts[12+index]}))}:{...block,content:texts[14]})});
  const en=translated('en',['[Demo] Product will not scan','Fictional example. Ask your manager to verify it before using it at work.','Inspect the barcode','Look for dirt on the barcode.','Wipe with a dry cloth','Wipe off the dirt using a dry cloth.','Scan again','Scan the barcode of the item you wiped.','Try another item','Scan another item’s barcode.','Do not disassemble the equipment.','Is the barcode dirty?','Yes, it is dirty','No, it is clean','Does the product name appear on the screen?']);
  const vi=translated('vi',['[Demo] Không quét được sản phẩm','Ví dụ giả định. Hãy nhờ quản lý kiểm tra trước khi sử dụng tại nơi làm việc.','Quan sát mã vạch','Quan sát xem mã vạch có bị bẩn không.','Lau bằng khăn khô','Lau sạch vết bẩn bằng khăn khô.','Quét lại','Quét mã vạch của sản phẩm vừa lau.','Thử sản phẩm khác','Quét mã vạch của sản phẩm khác.','Không tháo rời thiết bị.','Mã vạch có bị bẩn không?','Có, mã vạch bị bẩn','Không, mã vạch sạch','Tên sản phẩm đã xuất hiện trên màn hình chưa?']);
  const manual:Manual={...scope,id:'demo-interactive-manual',sourceQuestionIds:[question.id],status:'published',approvedBy:'sato',approvedAt:date,revision:1,reviewState:'pending_approval',languages:['ja','en','vi'],createdAt:date,updatedAt:date,imageUrls:[],content:programContent(program),program,programTranslations:{en,vi},translations:{en:programContent(en),vi:programContent(vi)},audit:[{revision:1,at:date,actor:'デモ作成者',action:'published',changes:['架空の対話型サンプル（AI生成結果ではありません）']}]};
  return {question,manual};
}
export function demoTranslation(value: string, target: 'ja' | 'en' | 'vi') {
  const column = {ja: 0, en: 1, vi: 2}[target];
  for (const row of examples) {
    if (row.slice(0, 3).includes(value)) return row[column];
    if (row.slice(3).includes(value)) return row[column + 3];
  }
  return '';
}
