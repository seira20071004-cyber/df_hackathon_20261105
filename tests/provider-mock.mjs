import sharp from 'sharp';

const originalFetch = globalThis.fetch;
const grid = await sharp({create:{width:800,height:600,channels:3,background:'#dceaff'}}).composite([
  {input:Buffer.from('<svg width="400" height="600"><rect x="80" y="110" width="220" height="340" rx="20" fill="#1d56b8"/><path d="M120 380L270 230" stroke="white" stroke-width="25"/></svg>'),left:0,top:0},
  {input:Buffer.from('<svg width="400" height="600"><circle cx="200" cy="290" r="120" fill="#1d56b8"/><path d="M130 290l50 50 100-110" fill="none" stroke="white" stroke-width="24"/></svg>'),left:400,top:0}
]).png().toBuffer();
globalThis.fetch = async (url,options) => {
  if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) return originalFetch(url,options);
  const request = JSON.parse(options.body);
  if (request.generationConfig?.responseModalities?.includes('IMAGE')) {
    await new Promise(resolve=>setTimeout(resolve,500));
    if (request.contents[0].parts[0].text.includes('画像失敗')) return Response.json({error:{status:'RESOURCE_EXHAUSTED'}},{status:429});
    return Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:grid.toString('base64')}}]}}]});
  }
  const schema=request.generationConfig?.responseJsonSchema;
  let result;
  if(schema?.properties?.facts) {
    const input=JSON.parse(request.contents[0].parts[0].text);
    const messages=input.conversation.filter(message=>message.role==='manager');
    const source=messages.at(-1);
    const quote=input.question.includes('根拠失敗') ? '会話に存在しない架空の指示' : source.original;
    result={facts:[{id:'f1',kind:'action',text:source.original,status:'current',evidence:[{messageId:source.id,quote}]}],
      unresolved:input.question.includes('矛盾失敗')?['保管場所の回答が矛盾しています']:[]};
  } else if (schema?.properties?.steps?.items?.properties?.evidence) {
    const input=JSON.parse(request.contents[0].parts[0].text);
    const evidence=input.facts[0].evidence;
    result={title:input.question,steps:[
      {text:input.question.includes('画像失敗') ? '画像失敗の手順を確認する' : '1階の清掃用具室へ行く',evidence},
      {text:'指定の保管棚を確認する',evidence}
    ],cautions:[]};
  } else if(schema?.properties?.titleMatchesQuestion) {
    const input=JSON.parse(request.contents[0].parts[0].text);
    const invalid=input.context.question.includes('意味失敗');
    result={titleMatchesQuestion:true,relevantFactsCovered:true,unresolvedConflict:false,
      checks:input.candidate.steps.map((_,index)=>({kind:'step',index,supported:!invalid,conditionsPreserved:true,currentFactsOnly:true,
        reason:invalid?'引用は実在するが対処法を裏付けていない':'原文と一致'}))};
  } else if (schema?.properties?.text) {
    const input=JSON.parse(request.contents[0].parts[0].text);
    result={text:typeof input==='string' ? input : input.value ?? '参考訳'};
  } else if (schema?.properties?.ids) {
    const input=JSON.parse(request.contents[0].parts[0].text);
    result={ids:input.candidates.slice(0,1).map(candidate=>candidate.id)};
  } else {
    const input=JSON.parse(request.contents[0].parts[0].text);
    result=input.manual;
  }
  return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]});
};

