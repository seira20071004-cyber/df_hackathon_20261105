import {copy} from '../lib/copy';
import {A4,fitA4Content} from '../lib/manual-document';
import type {Language,Manual} from '../lib/model';

const FONT='"Yu Gothic UI", "Segoe UI", Arial, sans-serif',M=44,WIDTH=A4.width-2*M;
type Paint=(ctx:CanvasRenderingContext2D)=>void;
type Picture={image:HTMLImageElement;caption:string};
const loadImage=(url:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=url;});

export async function renderA4Manual(manual:Manual,language:Language,overview:HTMLImageElement|null) {
  await document.fonts.ready;
  const content=manual.translations[language] ?? manual.content,t=(key:Parameters<typeof copy>[1])=>copy(language,key);
  const urls=[...new Set([...manual.imageUrls,...(manual.figures ?? []).map(figure=>figure.url)].filter(Boolean))];
  const pictures=new Map(await Promise.all(urls.map(async url=>[url,await loadImage(url)] as const)));
  const measure=document.createElement('canvas').getContext('2d');if(!measure)throw new Error('canvas-unavailable');
  const measuring=measure;
  function wrap(value:string,size:number,width:number,weight=400) {
    measuring.font=`${weight} ${size}px ${FONT}`;const lines:string[]=[];
    for(const paragraph of value.split('\n')) {
      let line='';for(const char of Array.from(paragraph)) {
        if(line&&measuring.measureText(line+char).width>width) {
          const space=line.lastIndexOf(' ');if(space>line.length*.45){lines.push(line.slice(0,space));line=line.slice(space+1)+char;}
          else{lines.push(line);line=char;}
        }else line+=char;
      }lines.push(line);
    }return lines;
  }
  const figures=(afterStep:number):Picture[] => (manual.figures ?? []).filter(figure=>figure.afterStep===afterStep).map(figure=>({image:pictures.get(figure.url)!,caption:figure.caption}));
  function layout(style:{font:number;image:number;hero:number;gap:number;pad:number}) {
    const draw:Paint[]=[];let y=0;
    function heading(value:string){const top=y;draw.push(ctx=>{ctx.fillStyle='#eaf0fc';ctx.fillRect(M,top,WIDTH,27);ctx.fillStyle='#233d65';ctx.font=`700 14px ${FONT}`;ctx.fillText(value,M+10,top+19);});y+=37;}
    function text(value:string,size:number,weight=400){const lines=wrap(value,size,WIDTH,weight);const top=y;draw.push(ctx=>{ctx.fillStyle='#10233e';ctx.font=`${weight} ${size}px ${FONT}`;lines.forEach((line,index)=>ctx.fillText(line,M,top+size+index*size*1.4));});y+=lines.length*size*1.4;}
    function pictureSize(picture:HTMLImageElement,width:number,height:number){const scale=Math.min(width/picture.naturalWidth,height/picture.naturalHeight);return {width:picture.naturalWidth*scale,height:picture.naturalHeight*scale};}
    function gallery(items:Picture[]) {
      for(let index=0;index<items.length;index+=2){const row=items.slice(index,index+2),width=row.length===1?WIDTH:(WIDTH-style.gap)/2;let rowHeight=0;
        row.forEach((item,column)=>{const size=pictureSize(item.image,width,style.image),caption=wrap(item.caption,style.font-2,width);const top=y,x=M+column*(width+style.gap);
          draw.push(ctx=>{ctx.drawImage(item.image,x+(width-size.width)/2,top,size.width,size.height);ctx.fillStyle='#536780';ctx.font=`${style.font-2}px ${FONT}`;caption.forEach((line,i)=>ctx.fillText(line,x,top+size.height+style.font+ i*(style.font+2)));});
          rowHeight=Math.max(rowHeight,size.height+(item.caption?caption.length*(style.font+2)+6:0));
        });y+=rowHeight+style.gap;
      }
    }
    heading(t('manualQuestion'));text(content.title,style.font+7,700);y+=16;
    heading(t('procedure'));
    if(overview){const size=pictureSize(overview,WIDTH,style.hero),top=y;draw.push(ctx=>ctx.drawImage(overview,(A4.width-size.width)/2,top,size.width,size.height));y+=size.height+style.gap;}
    gallery(figures(-1));
    const columns=content.steps.length>1&&(Boolean(overview)||urls.length>0||content.steps.length>3)?2:1;
    const cardWidth=(WIDTH-style.gap*(columns-1))/columns;
    for(let row=0;row<content.steps.length;row+=columns) {
      const cards=content.steps.slice(row,row+columns).map((step,column)=>{
        const index=row+column,body=wrap(step,style.font,cardWidth-2*style.pad),innerWidth=cardWidth-2*style.pad;
        const images=[...(!overview&&manual.imageLayout==='steps'&&manual.imageUrls[index]?[{image:pictures.get(manual.imageUrls[index])!,caption:''}]:[]),...figures(index)];
        const prepared=images.map(item=>({...item,size:pictureSize(item.image,innerWidth,style.image),lines:item.caption?wrap(item.caption,style.font-2,innerWidth):[]}));
        const height=style.pad+26+body.length*style.font*1.45+style.pad+prepared.reduce((sum,item)=>sum+item.size.height+(item.lines.length?item.lines.length*(style.font+1)+4:0)+12,0);
        return {index,body,prepared,height};
      });
      const rowHeight=Math.max(...cards.map(card=>card.height)),top=y;
      cards.forEach((card,column)=>{const x=M+column*(cardWidth+style.gap);draw.push(ctx=>{
        ctx.fillStyle='#f6f9ff';ctx.fillRect(x,top,cardWidth,rowHeight);ctx.strokeStyle='#dce5f0';ctx.strokeRect(x+.5,top+.5,cardWidth-1,rowHeight-1);
        ctx.fillStyle='#154fd2';ctx.font=`700 13px ${FONT}`;ctx.fillText('STEP '+String(card.index+1).padStart(2,'0'),x+style.pad,top+style.pad+14);
        ctx.fillStyle='#10233e';ctx.font=`${style.font}px ${FONT}`;
        card.body.forEach((line,i)=>ctx.fillText(line,x+style.pad,top+style.pad+26+style.font+i*style.font*1.45));
        let imageY=top+style.pad+26+card.body.length*style.font*1.45+10;
        card.prepared.forEach(item=>{ctx.drawImage(item.image,x+(cardWidth-item.size.width)/2,imageY,item.size.width,item.size.height);imageY+=item.size.height;
          ctx.fillStyle='#536780';ctx.font=`${style.font-2}px ${FONT}`;item.lines.forEach((line,index)=>ctx.fillText(line,x+style.pad,imageY+style.font+index*(style.font+1)));
          imageY+=(item.lines.length?item.lines.length*(style.font+1)+4:0)+12;
        });
      });});y+=rowHeight+style.gap;
    }
    if(manual.imageLayout!=='steps')gallery(manual.imageUrls.filter(Boolean).map(url=>({image:pictures.get(url)!,caption:''})));
    if(content.cautions.length){heading(t('cautions'));for(const caution of content.cautions){text('• '+caution,style.font-1);y+=6;}}
    return {height:y,draw};
  }
  const styles=[{font:17,image:140,hero:230,gap:14,pad:13},{font:15,image:110,hero:190,gap:11,pad:10},{font:13,image:80,hero:150,gap:8,pad:8}];
  let plan=layout(styles[0]);for(const style of styles.slice(1)){if(plan.height<=A4.height-137)break;plan=layout(style);}
  const fit=fitA4Content(Math.max(1,plan.height));
  const canvas=document.createElement('canvas');canvas.width=A4.pixelWidth;canvas.height=A4.pixelHeight;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('canvas-unavailable');ctx.scale(A4.pixelWidth/A4.width,A4.pixelHeight/A4.height);
  ctx.fillStyle='#fff';ctx.fillRect(0,0,A4.width,A4.height);ctx.fillStyle='#154fd2';ctx.font=`700 21px ${FONT}`;ctx.fillText('Bridge Work',M,37);
  ctx.fillStyle='#536780';ctx.font=`13px ${FONT}`;ctx.fillText((manual.siteId==='sakura'?'さくらビル':manual.siteId)+' · '+(manual.status==='published'?t('reviewed'):t('unreviewed')),M,62);
  ctx.strokeStyle='#dce5f0';ctx.beginPath();ctx.moveTo(M,80);ctx.lineTo(A4.width-M,80);ctx.stroke();
  ctx.save();ctx.translate(fit.x,fit.y);ctx.scale(fit.scale,fit.scale);plan.draw.forEach(command=>command(ctx));ctx.restore();
  ctx.fillStyle='#64748b';ctx.font=`11px ${FONT}`;ctx.fillText('A4 · 1 / 1',A4.width-M-63,A4.height-15);
  return canvas;
}
