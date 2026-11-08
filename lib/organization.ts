import {createHash,randomInt,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {getAuth,type DecodedIdToken} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {bridgeAdmin,slug} from './storage';
import {SecurityError} from './security-runtime';
import {languages,type Profile} from './model';

export const onboardingSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),name:z.string().trim().min(2).max(100),language:z.enum(languages)}).strict(),
 z.object({action:z.literal('join'),code:z.string().trim().regex(/^(?:[0-9]{6}|[A-Fa-f0-9]{24})$/),language:z.enum(languages)}).strict()
]);
export const inviteSchema=z.object({hours:z.literal(24).optional(),uses:z.number().int().min(1).max(50),siteId:slug}).strict();
const digest=(code:string)=>createHash('sha256').update(code.toUpperCase()).digest('hex');
export async function googleIdentity(token:string){
 const user=await getAuth(bridgeAdmin()).verifyIdToken(token,true).catch(()=>null);
 if(!user||user.firebase.sign_in_provider!=='google.com'||!user.email_verified)throw new SecurityError(401,'google-login-required');
 return user;
}
export async function onboard(user:DecodedIdToken,input:z.infer<typeof onboardingSchema>){
 const db=getFirestore(bridgeAdmin()),account=db.collection('users').doc(user.uid);
 const newOrg=randomUUID(),site='main',now=new Date().toISOString();
 return db.runTransaction(async tx=>{
  if((await tx.get(account)).exists)return {existing:true};
  const invite=input.action==='join'?db.collection('_bridgeInvitations').doc(digest(input.code)):null;
  const ticket=invite?(await tx.get(invite)).data():undefined;
  if(input.action==='join'&&(!ticket||!slug.safeParse(ticket.organizationId).success||!slug.safeParse(ticket.siteId).success||!Number.isInteger(ticket.remaining)||ticket.remaining<1||!(ticket.expiresAt?.toMillis()>Date.now())))throw new SecurityError(400,'invalid-invite');
  const organizationId=input.action==='create'?newOrg:ticket!.organizationId as string;
  const siteId=input.action==='create'?site:ticket!.siteId as string;
  const org=db.collection('organizations').doc(organizationId),siteDoc=org.collection('sites').doc(siteId);
  const organization=input.action==='join'?(await tx.get(org)).data():undefined;
  if(input.action==='join'&&(!organization||typeof organization.name!=='string'||!(await tx.get(siteDoc)).exists))throw new SecurityError(400,'invalid-invite');
  const role=input.action==='create'?'manager':'employee',companyName=input.action==='create'?input.name:organization!.name as string;
  const name=typeof user.name==='string'&&user.name.trim()?user.name.trim().slice(0,100):'Bridge Work';
  const photo=typeof user.picture==='string'&&/^https:\/\/lh[0-9]+\.googleusercontent\.com\//.test(user.picture)&&user.picture.length<=2048?user.picture:'';
  if(input.action==='create'){tx.create(org,{name:companyName,createdAt:now,createdBy:user.uid});tx.create(siteDoc,{name:companyName,createdAt:now});}
  else tx.update(invite!,{remaining:ticket!.remaining-1});
  tx.create(account,{name,companyName,photo,role,organizationId,siteIds:[siteId],preferredLanguage:input.language});
  tx.create(org.collection('members').doc(user.uid),{active:true,role,siteIds:[siteId],joinedAt:now});
  return {existing:false};
 });
}
export async function issueInvitation(profile:Profile,input:z.infer<typeof inviteSchema>){
 if(profile.role!=='manager'||!profile.siteIds.includes(input.siteId))throw new SecurityError(403,'forbidden');
 const db=getFirestore(bridgeAdmin());
 const org=db.collection('organizations').doc(profile.organizationId);
 const site=org.collection('sites').doc(input.siteId);
 const invitations=db.collection('_bridgeInvitations');
 const codes=new Set<string>();
 while(codes.size<8)codes.add(String(randomInt(1_000_000)).padStart(6,'0'));
 const candidates=[...codes].map(code=>({code,ref:invitations.doc(digest(code))}));
 return db.runTransaction(async tx=>{
  const [orgDoc,siteDoc,...existing]=await tx.getAll(org,site,...candidates.map(candidate=>candidate.ref));
  if(!orgDoc.exists||!siteDoc.exists)throw new SecurityError(409,'organization-not-configured');
  const free=existing.findIndex(doc=>!doc.exists);
  if(free<0)throw new SecurityError(503,'invite-code-unavailable');
  const {code,ref}=candidates[free];
  const expiresAt=new Date(Date.now()+24*3600_000);
  tx.create(ref,{organizationId:profile.organizationId,siteId:input.siteId,remaining:input.uses,expiresAt,createdBy:profile.id});
  return {code,expiresAt:expiresAt.toISOString()};
 });
}
