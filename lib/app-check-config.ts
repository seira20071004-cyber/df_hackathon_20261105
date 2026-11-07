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
export function publicGoogleAuth(env:Readonly<Record<string,string|undefined>>){
 const projectId=env.FIREBASE_PROJECT_ID?.trim(),apiKey=env.FIREBASE_WEB_API_KEY?.trim();
 return env.BRIDGE_GOOGLE_SIGN_IN==='true'&&env.BRIDGE_DEMO!=='true'&&projectId&&/^[a-z0-9-]{6,40}$/.test(projectId)&&apiKey&&apiKey!==env.GEMINI_API_KEY?.trim()?{projectId,apiKey,authDomain:projectId+'.firebaseapp.com'}:undefined;
}
export function appSecurityPolicy(env:Readonly<Record<string,string|undefined>>){
 const config=publicAppCheckConfig(env),csp=appCheckCsp(config.enabled&&config.configured),auth=publicGoogleAuth(env),authOrigin=auth?' https://'+auth.authDomain:'',frames=[...(csp.frame==="'none'"?[]:[csp.frame]),...(auth?[authOrigin.trim()]:[])].join(' ')||"'none'";
 return `default-src 'self'; script-src 'self' 'unsafe-inline'${env.NODE_ENV==='development'?" 'unsafe-eval'":''}${csp.script}${auth?' https://apis.google.com':''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:${csp.image}${auth?' https://*.googleusercontent.com':''}; font-src 'self' data:; connect-src 'self'${csp.connect}${auth?' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com'+authOrigin:''}; frame-src ${frames}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`;
}
