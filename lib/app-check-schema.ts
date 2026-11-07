import {z} from 'zod';
export const appCheckConfigSchema=z.discriminatedUnion('enabled',[
 z.object({enabled:z.literal(false),required:z.literal(false)}),
 z.object({enabled:z.literal(true),required:z.boolean(),configured:z.boolean(),siteKey:z.string().max(300).optional(),firebase:z.object({apiKey:z.string().max(300),appId:z.string().max(300),projectId:z.string().max(200)}).optional()})
]);
export type PublicAppCheck=z.infer<typeof appCheckConfigSchema>;
