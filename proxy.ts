import {NextResponse,type NextRequest} from 'next/server';
import {appSecurityPolicy} from './lib/app-check-config';
// Match runtime public config: Cloud Run environment is often set after building.
export function proxy(_request:NextRequest){const response=NextResponse.next();response.headers.set('Content-Security-Policy',appSecurityPolicy(process.env));return response;}
export const config={matcher:'/((?!_next/static|_next/image|favicon.ico).*)'};
