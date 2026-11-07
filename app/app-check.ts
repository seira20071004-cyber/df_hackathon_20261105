'use client';
import {createBridgeTransport} from '../lib/bridge-transport';
export const bridgeFetch=createBridgeTransport({fetcher:(...args)=>fetch(...args),loadTokenSource:async config=>{
 const [{getApps,initializeApp},{initializeAppCheck,ReCaptchaEnterpriseProvider,getToken}]=await Promise.all([import('firebase/app'),import('firebase/app-check')]);
 const name='bridge-work-app-check',app=getApps().find(app=>app.name===name)??initializeApp(config.firebase!,name);
 const check=initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(config.siteKey!),isTokenAutoRefreshEnabled:true});
 return {getToken:async force=>(await getToken(check,force)).token};
}});
