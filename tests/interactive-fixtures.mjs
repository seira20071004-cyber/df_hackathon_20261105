export const profile={id:'manager',name:'管理者',role:'manager',organizationId:'org',siteIds:['site'],preferredLanguage:'ja'};
export function questionFixture(){return {id:'chat',organizationId:'org',siteId:'site',employeeId:'worker',originalText:'商品を読み取れません',japaneseText:'商品を読み取れません',originalLanguage:'ja',status:'resolved',resolution:'',resolvedAt:'2026-11-06',createdAt:'2026-11-06',approvedForReuse:false,category:'その他',summary:'',references:[],messages:[
  {id:'m1',senderId:'manager',role:'manager',originalText:'汚れを目で確認してください。汚れていれば乾いた布で拭き、汚れていなければ別の商品を読み取ってください。商品名が表示されれば解決です。分解は禁止です。',translatedText:'',targetLanguage:'ja',createdAt:'2026-11-06'},
  {id:'e1',senderId:'worker',role:'employee',originalText:'布で拭くと商品名が表示されました。',translatedText:'',targetLanguage:'ja',createdAt:'2026-11-06'}]};}
export function factsFixture(){const quote=questionFixture().messages[0].originalText;return {title:'商品を読み取れない',description:'商品を読み取っても登録されないとき',causeKnown:false,hasAlternativeMethods:false,successfulActionIds:['a1'],unknowns:['原因は不明'],facts:[
  ...[['a1','action','汚れを確認する'],['a2','action','汚れている場合は乾いた布で拭く'],['cond','condition','汚れているかどうか'],['criterion','criterion','商品名が表示されれば解決'],['warn','warning','分解は禁止']].map(([id,kind,text])=>({id,kind,text,status:'current',evidence:[{messageId:'m1',quote}]})),
  {id:'result',kind:'result',text:'拭いた後に商品名が表示された',status:'current',evidence:[{messageId:'e1',quote:questionFixture().messages[1].originalText}]}]};}
const step=(id,title,next)=>({id,type:'step',title,content:title,supplement:'',nextBlockId:next,sourceMessageIds:['m1'],restricted:false,authorizationSourceMessageIds:[]});
export function programFixture(branch=false){return {title:'商品を読み取れない',description:'商品を読み取っても登録されないとき',language:'ja',startBlockId:branch?'warning':'inspect',blocks:branch?[
  {id:'warning',type:'warning',content:'分解は禁止です。',severity:'notice',nextBlockId:'inspect',sourceMessageIds:['m1']},step('inspect','汚れを目で確認する','branch'),
  {id:'branch',type:'branch',question:'バーコードは汚れていますか？',sourceMessageIds:['m1'],choices:[{id:'yes',label:'はい',nextBlockId:'wipe'},{id:'no',label:'いいえ',nextBlockId:'other'}]},
  step('wipe','乾いた布で拭く','check'),step('other','別の商品を読み取る','check'),{id:'check',type:'check',content:'商品名が画面に表示されましたか？',successNextBlockId:null,failureNextBlockId:null,sourceMessageIds:['m1']}
]:[step('inspect','汚れを目で確認する','wipe'),step('wipe','乾いた布で拭く','check'),{id:'check',type:'check',content:'商品名が画面に表示されましたか？',successNextBlockId:null,failureNextBlockId:null,sourceMessageIds:['m1']}]};}
export function qualityFixture(program){return {accurate:true,complete:true,clear:true,safe:true,issues:[],checks:program.blocks.map(block=>({blockId:block.id,supported:true,conditionsPreserved:true,safe:true,clear:true,reason:'原文と一致'}))};}
