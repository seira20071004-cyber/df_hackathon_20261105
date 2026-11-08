import {applicationDefault} from 'firebase-admin/app';
import {z} from 'zod';
import type {Language} from './model';
import {protectAiData} from './privacy';
import {withAiLimit} from './security-runtime';

export const chatTranslationEnabled=()=>process.env.BRIDGE_DEMO!=='true'&&process.env.BRIDGE_CLOUD_TRANSLATION==='true';
const responseSchema=z.object({translations:z.array(z.object({
 translatedText:z.string(),
 detectedLanguageCode:z.string().optional(),
}))});

export async function translateChatBatch(values:string[],target:Language){
 const project=process.env.GOOGLE_CLOUD_PROJECT||process.env.FIREBASE_PROJECT_ID;
 if(!project)throw new Error('translation-unavailable');
 const contents=await protectAiData(values);
 const credential=await applicationDefault().getAccessToken();
 const response=await withAiLimit(()=>fetch(
  'https://translation.googleapis.com/v3/projects/'+encodeURIComponent(project)+'/locations/global:translateText',
  {method:'POST',signal:AbortSignal.timeout(15000),headers:{
   Authorization:'Bearer '+credential.access_token,'Content-Type':'application/json','x-goog-user-project':project,
  },body:JSON.stringify({contents,targetLanguageCode:target,mimeType:'text/plain'})}
 ));
 if(!response.ok)throw new Error('translation-unavailable');
 const {translations}=responseSchema.parse(await response.json());
 if(translations.length!==values.length)throw new Error('translation-unavailable');
 return translations.map((row,index)=>{
  const translated=row.translatedText.trim();
  const source=row.detectedLanguageCode?.toLowerCase().split('-')[0];
  return !translated||source===target||translated===contents[index].trim()?null:translated;
 });
}
