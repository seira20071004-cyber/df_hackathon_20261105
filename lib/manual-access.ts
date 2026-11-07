import {z} from 'zod';
import type {Manual,Profile} from './model';
export const accessPolicySchema=z.object({level:z.enum(['PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED']),allowedRoles:z.array(z.enum(['employee','manager'])).min(1).max(2),allowedUserIds:z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/)).max(50)}).strict();
export type ManualAccess=z.infer<typeof accessPolicySchema>;
export const defaultAccess:ManualAccess={level:'INTERNAL',allowedRoles:['manager','employee'],allowedUserIds:[]};
export function manualAccess(manual:Manual):ManualAccess|undefined{if(!manual.access)return structuredClone(defaultAccess);const result=accessPolicySchema.safeParse(manual.access);return result.success?result.data:undefined;}
export function mayViewManual(profile:Profile,manual:Manual){
 if(profile.organizationId!==manual.organizationId||!profile.siteIds.includes(manual.siteId))return false;
 if(profile.role==='manager')return true;
 const policy=manualAccess(manual);if(manual.status!=='published'||!policy||policy.level==='RESTRICTED'||!policy.allowedRoles.includes(profile.role))return false;
 return policy.level!=='CONFIDENTIAL'||policy.allowedUserIds.includes(profile.id);
}
export function publishableAccess(manual:Manual){const policy=manualAccess(manual);return Boolean(policy&&policy.level!=='RESTRICTED'&&(policy.level!=='CONFIDENTIAL'||!policy.allowedRoles.includes('employee')||policy.allowedUserIds.length>0));}
