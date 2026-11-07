'use client';

import type {Auth} from 'firebase/auth';

export type GoogleConfig={projectId:string;apiKey:string;authDomain:string};
export const GOOGLE_SESSION='google-session';
const appName='bridge-work-login';
let authClient:Promise<Auth>|undefined;

export function googleAuthClient(config:GoogleConfig){
 if(!authClient){
  authClient=Promise.all([import('firebase/app'),import('firebase/auth')]).then(([apps,sdk])=>{
   const app=apps.getApps().find(item=>item.name===appName)??apps.initializeApp(config,appName);
   return sdk.getAuth(app);
  }).catch(error=>{authClient=undefined;throw error;});
 }
 return authClient;
}

export async function googleSessionToken(){
 if(!authClient)throw new Error('login-required');
 const auth=await authClient;
 await auth.authStateReady();
 const user=auth.currentUser;
 if(!user)throw new Error('login-required');
 return user.getIdToken();
}

export async function signInGoogle(config:GoogleConfig){
 const [auth,sdk]=await Promise.all([googleAuthClient(config),import('firebase/auth')]);
 await sdk.setPersistence(auth,sdk.browserSessionPersistence);
 const provider=new sdk.GoogleAuthProvider();
 provider.setCustomParameters({prompt:'select_account'});
 try{
  return await (await sdk.signInWithPopup(auth,provider)).user.getIdToken();
 }catch(error){
  const code=(error as {code?:string})?.code;
  if(code==='auth/unauthorized-domain')throw new Error('google-domain-not-authorized');
  if(code==='auth/popup-blocked')throw new Error('google-popup-blocked');
  throw new Error('google-login-failed');
 }
}

export async function signOutGoogle(){
 if(!authClient)return;
 const [auth,sdk]=await Promise.all([authClient,import('firebase/auth')]);
 await sdk.signOut(auth);
}
