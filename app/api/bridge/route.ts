import { NextRequest, NextResponse } from 'next/server';
import { authenticate, isDemo } from '../../../lib/storage';
import { actionSchema, ApiError, execute, workspace } from '../../../lib/workflow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => NextResponse.json(body, {status, headers: {'Cache-Control': 'no-store'}});

async function run(request: NextRequest) {
  try {
    if (request.method === 'GET' && request.nextUrl.searchParams.has('config')) return reply({demo: isDemo()});
    if (request.method === 'POST' && request.nextUrl.searchParams.has('login')) {
      if (isDemo() || !process.env.FIREBASE_WEB_API_KEY) return reply({error: 'firebase-unconfigured'}, 503);
      const body = await request.json();
      if (typeof body.email !== 'string' || typeof body.password !== 'string' || body.email.length > 254 || body.password.length > 4096) return reply({error:'invalid-input'},400);
      const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(process.env.FIREBASE_WEB_API_KEY), {
        method: 'POST', headers: {'Content-Type': 'application/json'}, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({email: body.email, password: body.password, returnSecureToken: true})
      });
      const result = await response.json();
      if (!response.ok || !await authenticate(result.idToken)) return reply({error:'login-failed'},401);
      return reply({token: result.idToken});
    }
    const profile = await authenticate(request.headers.get('Authorization')?.replace(/^Bearer /, '') || '');
    if (!profile) return reply({error:'login-required'},401);
    if (request.method === 'GET') return reply(await workspace(profile));
    const raw = await request.text();
    if (raw.length > 64000) return reply({error:'invalid-input'},413);
    let value: unknown;
    try {value = JSON.parse(raw);} catch {return reply({error:'invalid-input'},400);}
    const input = actionSchema.safeParse(value);
    if (!input.success) return reply({error:'invalid-input'},400);
    return reply(await execute(profile, input.data));
  } catch (error) {
    if (error instanceof ApiError) return reply({error: error.message}, error.status);
    console.error('Bridge Work request failed', error instanceof Error ? error.name : 'UnknownError', (error as NodeJS.ErrnoException | null)?.code);
    return reply({error:'server-error'},500);
  }
}

export const GET = run;
export const POST = run;
