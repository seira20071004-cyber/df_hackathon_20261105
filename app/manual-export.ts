import type {Language,Manual} from '../lib/model';

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
  const {renderA4Manual}=await import('./manual-print-layout');
  return renderA4Manual(manual,language,svg?await diagramImage(svg):null);
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
    const image=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('export-failed')),'image/jpeg',.94));
    const {jpeg300Dpi}=await import('../lib/manual-document');
    blob=new Blob([jpeg300Dpi(new Uint8Array(await image.arrayBuffer()))],{type:'image/jpeg'});
  }
  const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename+(format==='pdf'?'.pdf':'.jpg');
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
