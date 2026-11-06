import sharp from 'sharp';
import { z } from 'zod';
import type { Manual, ManualContent } from './model';

export const figureSchema=z.object({id:z.uuid(),afterStep:z.number().int().min(-1).max(11),
  url:z.string().max(180_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),caption:z.string().trim().max(200)});
export async function normalizeFigures(figures:z.infer<typeof figureSchema>[], stepCount:number) {
  if(new Set(figures.map(figure=>figure.id)).size!==figures.length || figures.some(figure=>figure.afterStep>=stepCount)) throw new Error('invalid-figures');
  const normalized=[];
  for(const figure of figures){
    const source=Buffer.from(figure.url.split(',')[1],'base64');
    const image=sharp(source,{limitInputPixels:16_000_000,animated:false});
    const metadata=await image.metadata();
    if(!['jpeg','png','webp'].includes(metadata.format ?? ''))throw new Error('invalid-figures');
    if(!figure.url.startsWith('data:image/'+metadata.format+';')||(metadata.pages??1)>1)throw new Error('invalid-figures');
    const bytes=await image.rotate().resize({width:1200,height:1000,fit:'inside',withoutEnlargement:true}).webp({quality:78}).toBuffer();
    normalized.push({...figure,url:'data:image/webp;base64,'+bytes.toString('base64')});
  }
  if(normalized.reduce((sum,figure)=>sum+figure.url.length,0)>280_000) throw new Error('manual-too-large');
  return normalized;
}

// Match by the original row identity, never by its new array index. Changed text
// invalidates that row's generated picture; moving an unchanged row keeps it.
export function reorderedAssets(previous:Manual, content:ManualContent, sources:number[]|undefined) {
  const sameSteps=JSON.stringify(previous.content.steps)===JSON.stringify(content.steps);
  if(!sources) return {images:sameSteps?previous.imageUrls:[],evidence:sameSteps?previous.evidence?.steps ?? []:[],unchanged:sameSteps};
  if(sources.length!==content.steps.length || sources.some(source=>source>=previous.content.steps.length) ||
    new Set(sources.filter(source=>source>=0)).size!==sources.filter(source=>source>=0).length) throw new Error('invalid-step-order');
  const matches=sources.map((source,index)=>source>=0 && previous.content.steps[source]===content.steps[index]);
  const images=previous.imageLayout==='steps' ? sources.map((source,index)=>matches[index]?previous.imageUrls[source] ?? '':'') :
    sameSteps?previous.imageUrls:[];
  return {images:images.some(Boolean)?images:[],evidence:sources.map((source,index)=>matches[index]?previous.evidence?.steps[source] ?? []:[]),unchanged:matches.every(Boolean)};
}
