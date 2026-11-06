export const A4={widthMm:210,heightMm:297,width:794,height:1123,pixelWidth:2480,pixelHeight:3508,dpi:300} as const;
export function fitA4Content(height:number,top=105,bottom=32) {
  if(!Number.isFinite(height)||height<=0)throw new Error('invalid-content-size');
  const scale=Math.min(1,(A4.height-top-bottom)/height);
  return {scale,x:(A4.width-A4.width*scale)/2,y:top};
}
// Canvas JPEGs normally declare screen density. Set the JFIF print density so
// 2480×3508 pixels are recognised as A4 at 300 dpi, without re-encoding pixels.
export function jpeg300Dpi(source:Uint8Array) {
  if(source[0]!==255||source[1]!==216)throw new Error('invalid-jpeg');
  const bytes=new Uint8Array(source);
  for(let offset=2;offset+17<bytes.length && bytes[offset]===255;) {
    const marker=bytes[offset+1];if(marker===218||marker===217)break;
    const length=(bytes[offset+2]<<8)|bytes[offset+3];if(length<2)break;
    if(marker===224 && bytes[offset+4]===74 && bytes[offset+5]===70 && bytes[offset+6]===73 && bytes[offset+7]===70 && bytes[offset+8]===0) {
      bytes[offset+11]=1;bytes[offset+12]=1;bytes[offset+13]=44;bytes[offset+14]=1;bytes[offset+15]=44;return bytes;
    }
    offset+=length+2;
  }
  const header=new Uint8Array([255,224,0,16,74,70,73,70,0,1,2,1,1,44,1,44,0,0]);
  const result=new Uint8Array(bytes.length+header.length);result.set(bytes.subarray(0,2));result.set(header,2);result.set(bytes.subarray(2),20);return result;
}
// The renderer supplies an A4 sheet; retain contain-fit for any other input.
export async function singlePagePdf(image:string,width:number,height:number,title:string) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('invalid-page-size');
  const {jsPDF}=await import('jspdf');
  const scale=Math.min(A4.widthMm/width,A4.heightMm/height);
  const w=width*scale,h=height*scale;
  const pdf=new jsPDF({unit:'mm',format:'a4',orientation:'portrait',compress:true});
  pdf.setProperties({title,author:'Bridge Work'});
  pdf.addImage(image,'JPEG',(A4.widthMm-w)/2,(A4.heightMm-h)/2,w,h);
  return pdf;
}
