import sharp from 'sharp';
import {programFixture,qualityFixture} from './interactive-fixtures.mjs';

const originalFetch = globalThis.fetch;
const grid = await sharp({create:{width:800,height:600,channels:3,background:'#dceaff'}}).composite([
  {input:Buffer.from('<svg width="400" height="600"><rect x="80" y="110" width="220" height="340" rx="20" fill="#1d56b8"/><path d="M120 380L270 230" stroke="white" stroke-width="25"/></svg>'),left:0,top:0},
  {input:Buffer.from('<svg width="400" height="600"><circle cx="200" cy="290" r="120" fill="#1d56b8"/><path d="M130 290l50 50 100-110" fill="none" stroke="white" stroke-width="24"/></svg>'),left:400,top:0}
]).png().toBuffer();
globalThis.fetch = async (url,options) => {
  if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) return originalFetch(url,options);
  const request = JSON.parse(options.body);
  if(String(url).includes('EmbedContent')||String(url).includes('embedContent')){const active=JSON.stringify(request).includes('低類似度')?1:0;const values=Array.from({length:256},(_,index)=>index===active?1:0);return Response.json({embeddings:[{values}],embedding:{values}});}
  if (request.generationConfig?.responseModalities?.includes('IMAGE')) {
    await new Promise(resolve=>setTimeout(resolve,500));
    if (request.contents[0].parts[0].text.includes('画像失敗')) return Response.json({error:{status:'RESOURCE_EXHAUSTED'}},{status:429});
    return Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:grid.toString('base64')}}]}}]});
  }
  const schema=request.generationConfig?.responseJsonSchema;
  const input=JSON.parse(request.contents[0].parts[0].text);
  const context=input.context??input;
  const demo=process.env.BRIDGE_AI_FIXTURES==='true';
  if(context.question?.includes('APIタイムアウト'))throw new DOMException('mock deadline','TimeoutError');
  if(context.question?.includes('API障害'))return Response.json({error:{code:503,message:'mock unavailable',status:'UNAVAILABLE'}},{status:503});
  if(context.question?.includes('利用枠エラー'))return Response.json({error:{code:429,message:'mock quota',status:'RESOURCE_EXHAUSTED'}},{status:429});
  if(context.question?.includes('不正JSON'))return Response.json({candidates:[{content:{parts:[{text:'{"broken":'}]}}]});
  let result;
  if(schema?.properties?.hasAlternativeMethods) {
    const source=input.sources.find(source=>source.role==='manager');
    const supplemented=input.sources.some(source=>source.role==='manager_supplement');
    const quote=input.question.includes('根拠失敗')?'存在しない指示':source.text;
    const kinds=[['a1','action','汚れを目で確認する'],['a2','action','乾いた布で拭く'],['criterion','criterion','商品名が表示されたら解決']];
    if(input.question.includes('分岐'))kinds.push(['condition','condition','汚れているかどうか'],['warning','warning','分解は禁止']);
    const alternatives=input.question.includes('追加確認')||input.question.includes('上限');
    result={title:input.question,description:'商品を読み取れない場合の確認手順',causeKnown:false,hasAlternativeMethods:alternatives,successfulActionIds:alternatives&&supplemented?['a1']:[],unknowns:['原因は不明'],
      facts:kinds.map(([id,kind,text])=>({id,kind,text,status:'current',evidence:[{messageId:source.id,quote}]}))};
  } else if(schema?.properties?.ready&&schema.properties.questions) {
    const missing=(input.context.question.includes('追加確認')&&!input.answers.length)||input.context.question.includes('上限');
    result={ready:!missing,hold:false,questions:missing?[{id:'q'+(input.previousQuestions.length+1),question:`解決した操作を確認してください（${input.previousQuestions.length+1}）`,reason:'複数の方法のうち成功した操作を確定するため',sourceMessageIds:[input.context.sources.find(source=>source.role==='manager').id]}]:[]};
  } else if(schema?.properties?.startBlockId) {
    if(input.program){result=structuredClone(input.program);result.language=input.language;}
    else {
      result=programFixture(input.context.question.includes('分岐'));result.title=input.extraction.title;const source=input.context.sources.find(source=>source.role==='manager').id;
      for(const block of result.blocks)block.sourceMessageIds=[source];
      if(input.context.question.includes('構造失敗'))result.blocks[0].nextBlockId='missing';
      if(input.context.question.includes('画像失敗'))result.blocks.find(block=>block.type==='step').content='画像失敗の手順';
    }
  } else if(schema?.properties?.accurate) {
    result=qualityFixture(input.candidate);
    if(input.context.question.includes('意味失敗')){result.accurate=false;result.checks[0].supported=false;result.issues=[{blockId:input.candidate.blocks[0].id,category:'accuracy',message:'根拠と操作が一致しません'}];}
  } else if(schema?.properties?.preserved) {
    result={preserved:true};
  } else if (schema?.properties?.text) {
    const line=typeof input==='string'?input:input.value??'参考訳';
    const translations={ja:'バーコードが読み取れません。どうすればよいですか？',en:'Check the barcode for dirt. Wipe it with a dry cloth and scan it again.',vi:'Hãy kiểm tra xem mã vạch có bị bẩn không. Lau bằng khăn khô rồi quét lại.'};
    result={text:demo&&/mã vạch|バーコード|商品名/.test(line)&&input.target?(translations[input.target]??({'日本語':translations.ja,English:translations.en,'Tiếng Việt':translations.vi})[input.target]??line):line};
  } else if (schema?.properties?.ids) {
    result={ids:input.question.includes('全く違う')?[]:input.candidates.slice(0,1).map(candidate=>candidate.id)};
  } else {
    result=input.manual;
  }
  return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]});
};

