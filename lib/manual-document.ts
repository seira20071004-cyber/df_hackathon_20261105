// A manual is always one sheet. Keep the image's aspect ratio, including long
// manuals, rather than inserting page breaks or clipping the final instructions.
export async function singlePagePdf(image:string,width:number,height:number,title:string) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('invalid-page-size');
  const {jsPDF}=await import('jspdf');
  const h=210*height/width;
  const factor=Math.min(1,5000/Math.max(210,h));
  const pageWidth=210*factor,pageHeight=h*factor;
  const pdf=new jsPDF({unit:'mm',format:[pageWidth,pageHeight],orientation:pageHeight>=pageWidth?'portrait':'landscape',compress:true});
  pdf.setProperties({title,author:'Bridge Work'});
  pdf.addImage(image,'JPEG',0,0,pageWidth,pageHeight);
  return pdf;
}
