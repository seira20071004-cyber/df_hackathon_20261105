import {copy} from '../lib/copy';
import type {Language,Manual} from '../lib/model';

const W=794,H=1123,M=54,SCALE=2;
const font='"Yu Gothic UI", "Segoe UI", Arial, sans-serif';
const imageFrom=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src;});

async function diagramImage(svg:SVGSVGElement) {
  const clone=svg.cloneNode(true) as SVGSVGElement;
  const originals=[svg,...svg.querySelectorAll('*')];const copies=[clone,...clone.querySelectorAll('*')];
  originals.forEach((element,index)=>{
    const computed=getComputedStyle(element);
    for(const name of ['fill','stroke','stroke-width','font-family','font-size','font-weight','text-anchor','opacity']) {
      let value=computed.getPropertyValue(name);
      if(value.includes('url('))value=value.replace(/url\(["']?[^#)]*#([^"')]+)["']?\)/g,'url(#$1)');
      (copies[index] as SVGElement).style.setProperty(name,value);
    }
  });
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('width','900');
  const view=svg.viewBox.baseVal;clone.setAttribute('height',String(900*view.height/view.width));
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'}));
  try{return await imageFrom(url);}finally{URL.revokeObjectURL(url);}
}

export async function renderManualSheet(manual:Manual,language:Language,svg:SVGSVGElement|null) {
  await document.fonts.ready;
  const content=manual.translations[language] ?? manual.content;
  const t=(key:Parameters<typeof copy>[1])=>copy(language,key);
  const measuring=document.createElement('canvas').getContext('2d');if(!measuring)throw new Error('canvas-unavailable');
  const measure=measuring;
  const draw:((context:CanvasRenderingContext2D)=>void)[]=[];
  let y=118;
  function lines(text:string,size:number,width:number,weight=400) {
    measure.font=`${weight} ${size}px ${font}`;
    const result:string[]=[];
    for(const paragraph of text.split('\n')) {
      let current='';
      for(const char of Array.from(paragraph)) {
        if(current && measure.measureText(current+char).width>width) {
          const space=current.lastIndexOf(' ');
          if(space>current.length*.45) {result.push(current.slice(0,space));current=current.slice(space+1)+char;}
          else {result.push(current);current=char;}
        }else current+=char;
      }
      result.push(current);
    }
    return result;
  }
  function text(value:string,size=20,weight=400,indent=0) {
    const wrapped=lines(value,size,W-2*M-indent,weight);
    for(const line of wrapped) {const top=y;draw.push(ctx=>{ctx.fillStyle='#10233e';ctx.font=`${weight} ${size}px ${font}`;ctx.fillText(line,M+indent,top+size);});y+=size*1.55;}
  }
  function heading(value:string) {
    y+=10;const top=y;draw.push(ctx=>{ctx.fillStyle='#eaf0fc';ctx.fillRect(M,top,W-2*M,34);ctx.fillStyle='#233d65';ctx.font=`700 18px ${font}`;ctx.fillText(value,M+12,top+24);});y+=49;
  }
  async function image(value:string|HTMLImageElement,maxHeight=310) {
    const picture=typeof value==='string'?await imageFrom(value):value;
    const ratio=Math.min((W-2*M)/picture.naturalWidth,maxHeight/picture.naturalHeight);
    const width=picture.naturalWidth*ratio,height=picture.naturalHeight*ratio;
    const top=y;draw.push(ctx=>ctx.drawImage(picture,(W-width)/2,top,width,height));y+=height+18;
  }
  async function figures(afterStep:number) {
    for(const figure of (manual.figures ?? []).filter(figure=>figure.afterStep===afterStep)) {
      await image(figure.url);if(figure.caption)text(figure.caption,16);y+=12;
    }
  }
  heading(t('manualQuestion'));text(content.title,27,700);y+=14;
  heading(t('procedure'));
  if(svg)await image(await diagramImage(svg),390);
  await figures(-1);
  for(let index=0;index<content.steps.length;index++) {
    y+=8;const top=y;draw.push(ctx=>{ctx.fillStyle='#154fd2';ctx.font=`700 17px ${font}`;ctx.fillText(String(index+1).padStart(2,'0'),M,top+22);});
    text(content.steps[index],20,400,37);y+=14;
    if(manual.imageLayout==='steps' && manual.imageUrls[index])await image(manual.imageUrls[index]);
    await figures(index);
  }
  if(manual.imageLayout!=='steps')for(const url of manual.imageUrls.filter(Boolean))await image(url);
  if(content.cautions.length){heading(t('cautions'));for(const caution of content.cautions){text('• '+caution,19);y+=10;}}
  const height=Math.max(H,Math.ceil(y+55));
  const scale=Math.min(SCALE,28000/height,Math.sqrt(40_000_000/(W*height)));
  const canvas=document.createElement('canvas');canvas.width=Math.round(W*scale);canvas.height=Math.round(height*scale);
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('canvas-unavailable');ctx.scale(scale,scale);
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,height);ctx.fillStyle='#154fd2';ctx.font=`700 23px ${font}`;ctx.fillText('Bridge Work',M,49);
  ctx.fillStyle='#536780';ctx.font=`15px ${font}`;ctx.fillText((manual.siteId==='sakura'?'さくらビル':manual.siteId)+' · '+(manual.status==='published'?t('reviewed'):t('unreviewed')),M,76);
  ctx.strokeStyle='#dce5f0';ctx.beginPath();ctx.moveTo(M,90);ctx.lineTo(W-M,90);ctx.stroke();
  draw.forEach(command=>command(ctx));
  ctx.fillStyle='#64748b';ctx.font=`14px ${font}`;ctx.fillText('1 / 1',W-M-48,height-28);
  return canvas;
}

export async function downloadManual(manual:Manual,language:Language,format:'pdf'|'jpeg',svg:SVGSVGElement|null) {
  const canvas=await renderManualSheet(manual,language,svg);
  const title=(manual.translations[language] ?? manual.content).title;
  const filename=(title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,75).trim() || 'manual')+'_'+language;
  let blob:Blob;
  if(format==='pdf') {
    const {singlePagePdf}=await import('../lib/manual-document');
    const pdf=await singlePagePdf(canvas.toDataURL('image/jpeg',.92),canvas.width,canvas.height,title);
    blob=pdf.output('blob');
  }else {
    blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('export-failed')),'image/jpeg',.94));
  }
  const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename+(format==='pdf'?'.pdf':'.jpg');
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
