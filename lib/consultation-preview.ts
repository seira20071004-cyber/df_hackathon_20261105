import type {Language} from './model';

// Translation detects the source from the message, not the user's setting.
export async function detectedPreviews(rows:{id:string;originalText:string}[],language:Language,translate:(texts:string[],target:Language)=>Promise<(string|null)[]>) {
  const results=await translate(rows.map(row=>row.originalText),language);
  if(results.length!==rows.length)throw new Error('translation-unavailable');
  return rows.map((row,index)=>({id:row.id,text:results[index]??row.originalText}));
}
