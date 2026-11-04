import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type CollectionReference } from 'firebase-admin/firestore';
import { z } from 'zod';
import { demoProfiles, seedDemo } from './demo';
import { languages, type Profile, type Question, type Manual } from './model';

export const isDemo = () => process.env.BRIDGE_DEMO === 'true';
export const slug = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
const profileSchema = z.object({name: z.string(), role: z.enum(['employee','manager']), organizationId: slug, siteIds: z.array(slug).min(1).max(30), preferredLanguage: z.enum(languages)});
function app() {
  return getApps()[0] ?? initializeApp({credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID});
}
export async function authenticate(token: string): Promise<Profile | null> {
  if (isDemo()) return Object.hasOwn(demoProfiles, token) ? {...demoProfiles[token]} : null;
  if (!token) return null;
  const user = await getAuth(app()).verifyIdToken(token, true).catch(() => null);
  if (!user) return null;
  const doc = await getFirestore(app()).collection('users').doc(user.uid).get();
  const profile = profileSchema.safeParse(doc.data());
  return profile.success ? {...profile.data, id: user.uid} : null;
}
export async function setLanguage(profile: Profile, preferredLanguage: Profile['preferredLanguage']) {
  if (!isDemo()) await getFirestore(app()).collection('users').doc(profile.id).update({preferredLanguage});
}
type Records = {questions: Question; manuals: Manual};
type Table = keyof Records;
type DemoState = {[K in Table]: Records[K][]};
const folder = process.env.BRIDGE_DEMO_DATA_DIR || '.bridge-work';
const demoFile = join(folder, 'data.json');
let pending = Promise.resolve();
async function readDemo(): Promise<DemoState> {
  try {
    return JSON.parse(await readFile(demoFile, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return seedDemo();
  }
}
function collection<T extends Table>(profile: Profile, siteId: string, table: T) {
  if (!profile.siteIds.includes(siteId)) throw new Error('Forbidden site');
  return getFirestore(app()).collection('organizations').doc(profile.organizationId)
    .collection('sites').doc(siteId).collection(table) as CollectionReference<Records[T]>;
}
export async function list<T extends Table>(profile: Profile, siteId: string, table: T): Promise<Records[T][]> {
  if (!profile.siteIds.includes(siteId)) return [];
  if (isDemo()) return (await readDemo())[table];
  const snapshot = await collection(profile, siteId, table).get();
  return snapshot.docs.map(doc => doc.data());
}
export async function mutate<T extends Table>(profile: Profile, siteId: string, table: T, id: string, update: (previous: Records[T] | undefined) => Records[T]) {
  if (!profile.siteIds.includes(siteId)) throw new Error('Forbidden site');
  if (!isDemo()) {
    const doc = collection(profile, siteId, table).doc(id);
    return doc.firestore.runTransaction(async tx => {
      const next = update((await tx.get(doc)).data());
      tx.set(doc, next);
      return next;
    });
  }
  const operation = pending.then(async () => {
    const data = await readDemo();
    const records = data[table];
    const next = update(records.find(record => record.id === id));
    const index = records.findIndex(record => record.id === id);
    if (index === -1) records.push(next);
    else records[index] = next;
    await mkdir(folder, {recursive: true});
    const temp = join(folder, randomUUID() + '.tmp');
    await writeFile(temp, JSON.stringify(data), 'utf8');
    await rename(temp, demoFile);
    return next;
  });
  pending = operation.then(() => undefined, () => undefined);
  return operation;
}
