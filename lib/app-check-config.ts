import type {PublicAppCheck} from './app-check-schema.ts';
export {appCheckConfigSchema,type PublicAppCheck} from './app-check-schema.ts';
// Firebase Web config and a reCAPTCHA site key are public identifiers, not server credentials.
export function publicAppCheckConfig(env:Readonly<Record<string,string|undefined>>):PublicAppCheck{
 const required=env.BRIDGE_APP_CHECK_ENFORCE==='true';
 if(!required&&env.BRIDGE_APP_CHECK_CLIENT_ENABLED!=='true')return {enabled:false,required:false};
 const siteKey=env.BRIDGE_APP_CHECK_SITE_KEY?.trim(),apiKey=env.FIREBASE_WEB_API_KEY?.trim(),appId=env.FIREBASE_WEB_APP_ID?.trim(),projectId=env.FIREBASE_PROJECT_ID?.trim();
 const allowed=(env.BRIDGE_APP_CHECK_APP_IDS??'').split(',').map(value=>value.trim()).filter(Boolean);
 if(!siteKey||!apiKey||!appId||!projectId||apiKey===env.GEMINI_API_KEY?.trim()||required&&!allowed.includes(appId))return {enabled:true,required,configured:false};
 return {enabled:true,required,configured:true,siteKey,firebase:{apiKey,appId,projectId}};
}
export function appCheckCsp(enabled:boolean){return enabled?{
 script:" https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/",
 connect:" https://firebaseappcheck.googleapis.com https://content-firebaseappcheck.googleapis.com https://recaptchaenterprise.googleapis.com https://www.google.com/recaptcha/",
 frame:"https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/",
 image:" https://www.gstatic.com/recaptcha/"
 }:{script:'',connect:'',frame:"'none'",image:''};}
export function appSecurityPolicy(env:Readonly<Record<string,string|undefined>>){
 const config=publicAppCheckConfig(env),csp=appCheckCsp(config.enabled&&config.configured);
 return `default-src 'self'; script-src 'self' 'unsafe-inline'${env.NODE_ENV==='development'?" 'unsafe-eval'":''}${csp.script}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:${csp.image}; font-src 'self' data:; connect-src 'self'${csp.connect}; frame-src ${csp.frame}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`;
}
