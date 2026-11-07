import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=process.argv[2]??'3005';
const built=process.argv[3]==='--built';
if(!/^\d+$/.test(port)||Number(port)<1024||Number(port)>65535)throw Error('Specify a port between 1024 and 65535');
const env={...process.env,BRIDGE_DEMO:'true',BRIDGE_AI_FIXTURES:'true',BRIDGE_ALLOW_PUBLIC_DEMO:built?'true':'false',BRIDGE_DEMO_DATA_DIR:join(root,'.bridge-work',built?'hackathon-enterprise-preview':'hackathon-demo'),
 BRIDGE_ALLOWED_ORIGINS:'http://127.0.0.1:'+port,BRIDGE_SENSITIVE_PROVIDER:'local',BRIDGE_PRIVACY_STRICT:'false',BRIDGE_APP_CHECK_ENFORCE:'false',BRIDGE_APP_CHECK_CLIENT_ENABLED:'false',
 GEMINI_API_KEY:'fixture-only',GEMINI_API_KEY_SECRET:'',GEMINI_API_KEY_FILE:'',GEMINI_PROVIDER:'developer',GEMINI_VERTEX_AUTH:'',
 GEMINI_GENERATE_IMAGES:'false',GEMINI_EMBEDDING_MODEL:'',GOOGLE_GENAI_USE_VERTEXAI:'false',GOOGLE_GEMINI_BASE_URL:'https://generativelanguage.googleapis.com'};
console.log('Bridge Work fictional demo: simulated AI, separate local data. No Gemini requests leave this process.');
const processHandle=spawn(process.execPath,['--import',new URL('../tests/provider-mock.mjs',import.meta.url).href,join(root,'node_modules/next/dist/bin/next'),...(built?['start']:['dev','--webpack']),'-H','127.0.0.1','-p',port],{cwd:root,env,stdio:'inherit'});
processHandle.on('exit',code=>{process.exitCode=code??0;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(!processHandle.killed)processHandle.kill(signal);});
