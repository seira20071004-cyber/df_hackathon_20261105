import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type CollectionReference } from 'firebase-admin/firestore';
import { z } from 'zod';
import {preservePublication,releasedManual} from './publication';
import { demoProfiles, seedDemo } from './demo';
import { languages,mayReadManual, type Profile, type Question, type Manual, type ManualView, type ManualDelivery, type StaffRecipient,type ManualUse } from './model';

export const isDemo = () => process.env.BRIDGE_DEMO === 'true';
export const slug = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
const profileSchema = z.object({name: z.string(), companyName:z.string().trim().min(1).max(200).optional(),photo:z.string().max(2048).optional(),role: z.enum(['employee','manager']), organizationId: slug, siteIds: z.array(slug).min(1).max(30), preferredLanguage: z.enum(languages)});
export function bridgeAdmin() {
  return getApps()[0] ?? initializeApp({credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID});
}
export async function authenticate(token: string,organizationId?:string): Promise<Profile | null> {
  if (isDemo()) return Object.hasOwn(demoProfiles, token)&&(!organizationId||organizationId===demoProfiles[token].organizationId) ? {...demoProfiles[token]} : null;
  if (!token) return null;
  const user = await getAuth(bridgeAdmin()).verifyIdToken(token, true).catch(() => null);
  if (!user) return null;
  const doc = await getFirestore(bridgeAdmin()).collection('users').doc(user.uid).get();
  const profile = profileSchema.safeParse(doc.data());
  if(!profile.success)return null;
  if(organizationId&&organizationId!==profile.data.organizationId){
    if(!slug.safeParse(organizationId).success)return null;
    const member=await getFirestore(bridgeAdmin()).collection('organizations').doc(organizationId).collection('members').doc(user.uid).get();
    const membership=z.object({active:z.literal(true),role:z.enum(['employee','manager']),siteIds:z.array(slug).min(1).max(30)}).safeParse(member.data());
    if(!membership.success)return null;
    return {...profile.data,...membership.data,organizationId,id:user.uid};
  }
  return {...profile.data, id: user.uid};
}
export async function setDisplayName(profile:Profile,name:string){
 if(!isDemo())await getFirestore(bridgeAdmin()).collection('users').doc(profile.id).update({name});
}
export async function setLanguage(profile: Profile, preferredLanguage: Profile['preferredLanguage']) {
  if (!isDemo()) await getFirestore(bridgeAdmin()).collection('users').doc(profile.id).update({preferredLanguage});
}
type Records = {questions: Question; manuals: Manual; manualViews: ManualView; manualDeliveries:ManualDelivery;manualUses:ManualUse};
type Table = keyof Records;
type DemoState = {[K in Table]: Records[K][]};
const folder = process.env.BRIDGE_DEMO_DATA_DIR || '.bridge-work';
const demoFile = join(folder, 'data.json');
let pending = Promise.resolve();
async function readDemo(): Promise<DemoState> {
  try {
    return {manualViews: [], manualDeliveries:[],manualUses:[], ...JSON.parse(await readFile(demoFile, 'utf8'))};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return {...seedDemo(), manualViews: [],manualDeliveries:[],manualUses:[]};
  }
}
export async function siteSafety(profile:Profile,siteId:string){
 if(!profile.siteIds.includes(siteId)||isDemo())return undefined;
 const value=(await getFirestore(bridgeAdmin()).collection('organizations').doc(profile.organizationId).collection('sites').doc(siteId).get()).data()?.safety;
 const result=z.object({keywords:z.array(z.string().min(1).max(80)).max(30),contact:z.string().max(300),instructions:z.string().max(1000)}).safeParse(value);
 return result.success?result.data:undefined;
}
export async function siteManagers(profile:Profile):Promise<StaffRecipient[]> {
 if(profile.role!=='manager')return [];
 const profiles:Profile[]=isDemo()?Object.values(demoProfiles):(await getFirestore(bridgeAdmin()).collection('users').where('organizationId','==',profile.organizationId).where('role','==','manager').get()).docs.flatMap(doc=>{const result=profileSchema.safeParse(doc.data());return result.success?[{...result.data,id:doc.id}]:[];});
 return [profile,...profiles.filter(row=>row.id!==profile.id&&row.organizationId===profile.organizationId&&row.role==='manager')].map(({id,name,siteIds})=>({id,name,siteIds:siteIds.filter(site=>profile.siteIds.includes(site))}));
}
export async function staffRecipients(profile:Profile):Promise<StaffRecipient[]> {
  if(profile.role!=='manager')return [];
  const profiles:Profile[]=isDemo()?Object.values(demoProfiles):
    (await getFirestore(bridgeAdmin()).collection('users').where('organizationId','==',profile.organizationId).get()).docs.flatMap(doc=>{
      const result=profileSchema.safeParse(doc.data());return result.success?[{...result.data,id:doc.id}]:[];
    });
  return profiles.filter(row=>row.organizationId===profile.organizationId && row.role==='employee' && row.siteIds.some(site=>profile.siteIds.includes(site)))
    .map(({id,name,siteIds})=>({id,name,siteIds:siteIds.filter(site=>profile.siteIds.includes(site))})).sort((a,b)=>a.name.localeCompare(b.name));
}

export async function deliverManual(profile:Profile,siteId:string,manualId:string,version:string,employees:string[]) {
  if(profile.role!=='manager' || !profile.siteIds.includes(siteId))throw new Error('forbidden');
  const recipientIds=[...new Set(employees)];
  const ids=recipientIds.map(employeeId=>createHash('sha256').update(JSON.stringify([profile.organizationId,siteId,manualId,version,employeeId])).digest('hex'));
  const check=(manual:Manual|undefined,recipients:(Profile|undefined)[])=>{
    if(!manual || manual.organizationId!==profile.organizationId || manual.siteId!==siteId || manual.status!=='published')throw new Error('manual-not-published');
    if(manual.updatedAt!==version)throw new Error('stale-manual');
    if(recipients.some(recipient=>!recipient || recipient.role!=='employee' || recipient.organizationId!==profile.organizationId || !recipient.siteIds.includes(siteId)||!mayReadManual(recipient,manual)))throw new Error('invalid-recipient');
  };
  const create=(employeeId:string,index:number):ManualDelivery=>({id:ids[index],organizationId:profile.organizationId,siteId,manualId,version,
    employeeId,sentBy:profile.id,createdAt:new Date().toISOString(),readAt:null});
  if(isDemo())return mutateDemo(data=>{
    const stored=data.manuals.find(row=>row.id===manualId);check(stored&&releasedManual(stored),recipientIds.map(id=>demoProfiles[id]));
    recipientIds.forEach((employeeId,index)=>{if(!data.manualDeliveries.some(row=>row.id===ids[index]))data.manualDeliveries.push(create(employeeId,index));});
    return {sent:recipientIds.length};
  });
  const manualDoc=collection(profile,siteId,'manuals').doc(manualId);
  return manualDoc.firestore.runTransaction(async tx=>{
    const stored=(await tx.get(manualDoc)).data();const manual=stored&&releasedManual(stored);
    const users=await tx.getAll(...recipientIds.map(id=>getFirestore(bridgeAdmin()).collection('users').doc(id)));
    check(manual,users.map(doc=>{const result=profileSchema.safeParse(doc.data());return result.success?{...result.data,id:doc.id}:undefined;}));
    const deliveryDocs=ids.map(id=>collection(profile,siteId,'manualDeliveries').doc(id));
    const previous=await tx.getAll(...deliveryDocs);
    recipientIds.forEach((employeeId,index)=>{if(!previous[index].exists)tx.create(deliveryDocs[index],create(employeeId,index));});
    return {sent:recipientIds.length};
  });
}
function collection<T extends Table>(profile: Profile, siteId: string, table: T) {
  if (!profile.siteIds.includes(siteId)) throw new Error('Forbidden site');
  return getFirestore(bridgeAdmin()).collection('organizations').doc(profile.organizationId)
    .collection('sites').doc(siteId).collection(table) as CollectionReference<Records[T]>;
}
export async function list<T extends Table>(profile: Profile, siteId: string, table: T): Promise<Records[T][]> {
  if (!profile.siteIds.includes(siteId)) return [];
  if (isDemo()) return (await readDemo())[table].filter(row=>row.organizationId===profile.organizationId&&row.siteId===siteId);
  const snapshot = await collection(profile, siteId, table).get();
  return snapshot.docs.map(doc => doc.data()).filter(row=>row.organizationId===profile.organizationId&&row.siteId===siteId);
}
export async function mutate<T extends Table>(profile: Profile, siteId: string, table: T, id: string, update: (previous: Records[T] | undefined) => Records[T]) {
  if (!profile.siteIds.includes(siteId)) throw new Error('Forbidden site');
  function checked(previous:Records[T]|undefined){
    if(previous&&(previous.id!==id||previous.organizationId!==profile.organizationId||previous.siteId!==siteId))throw new Error('scope-conflict');
    let next=update(previous);
    if(next.id!==id||next.organizationId!==profile.organizationId||next.siteId!==siteId)throw new Error('scope-conflict');
    if(table==='manuals')next=preservePublication(previous as Manual|undefined,next as Manual) as Records[T];
    if(Buffer.byteLength(JSON.stringify(next))>950_000)throw new Error('record-too-large');return next;
  }
  if (!isDemo()) {
    const doc = collection(profile, siteId, table).doc(id);
    return doc.firestore.runTransaction(async tx => {
      const next = checked((await tx.get(doc)).data());
      tx.set(doc, next);
      return next;
    });
  }
  return mutateDemo(data => {
    const records = data[table];
    const next = checked(records.find(record => record.id === id));
    const index = records.findIndex(record => record.id === id);
    if (index === -1) records.push(next);
    else records[index] = next;
    return next;
  });
}
function mutateDemo<T>(update: (data: DemoState) => T) {
  const operation = pending.then(async () => {
    const data = await readDemo();
    const next = update(data);
    await mkdir(folder, {recursive: true});
    const temp = join(folder, randomUUID() + '.tmp');
    await writeFile(temp, JSON.stringify(data), 'utf8');
    try {
      // Windows readers/antivirus can briefly hold the destination open. Preserve
      // atomic replacement; never delete the current file to get around the lock.
      for(let attempt=0;;attempt++) {
        try {await rename(temp,demoFile);break;}
        catch(error) {
          if(process.platform!=='win32' || !['EPERM','EBUSY','EACCES'].includes((error as NodeJS.ErrnoException).code ?? '') || attempt>=5) throw error;
          await delay(15 * 2 ** attempt);
        }
      }
    } catch(error) {await rm(temp,{force:true}).catch(()=>undefined);throw error;}
    return next;
  });
  pending = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function resolveWithManual(profile: Profile, siteId: string, manual: Manual, update: (previous: Question | undefined) => Question) {
  if(profile.role!=='employee'||!profile.siteIds.includes(siteId)||manual.organizationId!==profile.organizationId||manual.siteId!==siteId||manual.status!=='draft'||manual.approvedBy)throw new Error('scope-conflict');
  const id = manual.sourceQuestionIds[0];
  if (!isDemo()) {
    const questionDoc = collection(profile, siteId, 'questions').doc(id);
    const manualDoc = collection(profile, siteId, 'manuals').doc(manual.id);
    return questionDoc.firestore.runTransaction(async tx => {
      const previous = (await tx.get(questionDoc)).data();
      const next = update(previous);
      if (previous !== next) {
        tx.set(questionDoc, next);
        tx.create(manualDoc, manual);
      }
      return {question: next, created: previous !== next};
    });
  }
  return mutateDemo(data => {
    const index = data.questions.findIndex(question => question.id === id);
    const previous = data.questions[index];
    const next = update(previous);
    if (previous !== next) {
      data.questions[index] = next;
      data.manuals.push(manual);
    }
    return {question: next, created: previous !== next};
  });
}

export async function recordManualSession(profile:Profile,record:ManualUse,question?:Question){
  const {siteId}=record;
  if(profile.role!=='employee'||!profile.siteIds.includes(siteId)||record.organizationId!==profile.organizationId||record.employeeId!==profile.id)throw new Error('forbidden');
  const viewId=createHash('sha256').update(JSON.stringify([profile.id,record.manualId])).digest('hex');
  function validate(manual:Manual|undefined,view:ManualView|undefined,previous:ManualUse|undefined){
    manual=manual&&releasedManual(manual);
    if(!manual||!mayReadManual(profile,manual)||manual.updatedAt!==record.version||!manual.program)throw new Error('manual-unavailable');
    if(!view||view.employeeId!==profile.id||view.version!==record.version)throw new Error('manual-unavailable');
    if(previous&&(previous.employeeId!==profile.id||previous.manualId!==record.manualId||previous.version!==record.version))throw new Error('session-conflict');
    if(record.outcome!=='started'&&!previous)throw new Error('session-not-started');
  }
  const next=(previous:ManualUse|undefined)=>previous?.outcome==='resolved'||previous?.outcome==='unresolved'||(previous&&record.outcome==='started')?previous:
    {...record,createdAt:previous?.createdAt??record.createdAt};
  if(isDemo())return mutateDemo(data=>{
    const previous=data.manualUses.find(row=>row.id===record.id);
    validate(data.manuals.find(row=>row.id===record.manualId),data.manualViews.find(row=>row.id===viewId),previous);
    const saved=next(previous);if(saved===previous)return {use:saved,question:previous?.questionId?data.questions.find(row=>row.id===previous.questionId):undefined};
    if(question&&data.questions.some(row=>row.id===question.id))throw new Error('session-conflict');
    const index=data.manualUses.findIndex(row=>row.id===record.id);if(index<0)data.manualUses.push(saved);else data.manualUses[index]=saved;
    if(question)data.questions.push(question);return {use:saved,question};
  });
  const useDoc=collection(profile,siteId,'manualUses').doc(record.id),manualDoc=collection(profile,siteId,'manuals').doc(record.manualId),viewDoc=collection(profile,siteId,'manualViews').doc(viewId);
  return useDoc.firestore.runTransaction(async tx=>{
    const manual=(await tx.get(manualDoc)).data(),view=(await tx.get(viewDoc)).data(),previous=(await tx.get(useDoc)).data();
    validate(manual,view,previous);const saved=next(previous);
    const questionDoc=question?collection(profile,siteId,'questions').doc(question.id):previous?.questionId?collection(profile,siteId,'questions').doc(previous.questionId):undefined;
    const existingQuestion=questionDoc?(await tx.get(questionDoc)).data():undefined;
    if(saved===previous)return {use:saved,question:existingQuestion};
    if(question&&existingQuestion)throw new Error('session-conflict');
    tx.set(useDoc,saved);if(question&&questionDoc)tx.create(questionDoc,question);return {use:saved,question};
  });
}
export async function openPublishedManual(profile:Profile,siteId:string,id:string,version:string){
 if(profile.role!=='employee'||!profile.siteIds.includes(siteId))throw new Error('manual-unavailable');
 const viewId=createHash('sha256').update(JSON.stringify([profile.id,id])).digest('hex');
 function checked(row:Manual|undefined){const manual=row&&releasedManual(row);if(!manual||!mayReadManual(profile,manual)||manual.updatedAt!==version)throw new Error('manual-unavailable');return manual;}
 const view:ManualView={id:viewId,employeeId:profile.id,organizationId:profile.organizationId,siteId,manualId:id,version};
 if(isDemo())return mutateDemo(data=>{const manual=checked(data.manuals.find(row=>row.id===id&&row.organizationId===profile.organizationId&&row.siteId===siteId));
  const index=data.manualViews.findIndex(row=>row.id===viewId&&row.organizationId===profile.organizationId&&row.siteId===siteId);if(index<0)data.manualViews.push(view);else data.manualViews[index]=view;
  for(const row of data.manualDeliveries)if(row.organizationId===profile.organizationId&&row.siteId===siteId&&row.employeeId===profile.id&&row.manualId===id&&row.version===version)row.readAt??=new Date().toISOString();return manual;});
 const doc=collection(profile,siteId,'manuals').doc(id),views=collection(profile,siteId,'manualViews').doc(viewId);
 return doc.firestore.runTransaction(async tx=>{const manual=checked((await tx.get(doc)).data());
  const deliveries=await tx.get(collection(profile,siteId,'manualDeliveries').where('employeeId','==',profile.id));
  tx.set(views,view);for(const row of deliveries.docs){const data=row.data();if(data.organizationId===profile.organizationId&&data.siteId===siteId&&data.manualId===id&&data.version===version&&!data.readAt)tx.update(row.ref,{readAt:new Date().toISOString()});}return manual;});
}
