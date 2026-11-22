import * as SecureStore from 'expo-secure-store';

import type { FamilySessionStore, PendingSessionRevoke } from '../application/family-use-cases';

export const FAMILY_SESSION_SECURE_KEY = 'lampy.family.session.v1';
export const FAMILY_PENDING_REVOKE_SECURE_KEY = 'lampy.family.pending-revoke.v1';

export type SecureKv = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
};

type StoredSession = {
  userId: string;
  sessionToken: string;
};

function parseStored(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed.userId === 'string' && typeof parsed.sessionToken === 'string') {
      return { userId: parsed.userId, sessionToken: parsed.sessionToken };
    }
    return null;
  } catch {
    return null;
  }
}

function parsePending(raw: string | null): PendingSessionRevoke | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingSessionRevoke>;
    if (
      typeof parsed.userId === 'string' &&
      typeof parsed.sessionToken === 'string' &&
      typeof parsed.createdAt === 'string'
    ) {
      return { userId: parsed.userId, sessionToken: parsed.sessionToken, createdAt: parsed.createdAt };
    }
    return null;
  } catch {
    return null;
  }
}

const defaultKv: SecureKv = {
  getItem: key => SecureStore.getItemAsync(key),
  setItem: (key,value) => SecureStore.setItemAsync(key,value),
  deleteItem: key => SecureStore.deleteItemAsync(key),
};
// All stores backed by the same KV share the identity revision and write queue.
const states = new WeakMap<SecureKv, {revision:number;listeners:Set<()=>void>;queue:Promise<unknown>}>();
export function createSecureFamilySessionStore(kv: SecureKv = defaultKv): FamilySessionStore {
  let shared = states.get(kv);
  if (!shared) {shared={revision:0,listeners:new Set(),queue:Promise.resolve()};states.set(kv,shared);}
  const state=shared;
  function enqueue(work:()=>Promise<void>) {
    const result=state.queue.then(work,work);
    state.queue=result.then(()=>undefined,()=>undefined);
    return result;
  }
  function mutate(work:()=>Promise<void>) {
    // Invalidate requests immediately, even if a secure-store write is still queued.
    state.revision++;
    const result=enqueue(work);
    for (const listener of state.listeners) listener();
    return result;
  }
  async function read() {await state.queue;return parseStored(await kv.getItem(FAMILY_SESSION_SECURE_KEY));}
  return {
    getRevision:()=>state.revision,
    subscribe(listener) {state.listeners.add(listener);return ()=>{state.listeners.delete(listener);};},
    getSession:read,
    async getSessionToken() {return (await read())?.sessionToken??null;},
    async getUserId() {return (await read())?.userId??null;},
    async setSession(session) {await mutate(()=>kv.setItem(FAMILY_SESSION_SECURE_KEY,JSON.stringify(session)));},
    async clearSession() {await mutate(()=>kv.deleteItem(FAMILY_SESSION_SECURE_KEY));},
    async getPendingRevoke() {await state.queue;return parsePending(await kv.getItem(FAMILY_PENDING_REVOKE_SECURE_KEY));},
    async savePendingRevoke(row) {await enqueue(()=>kv.setItem(FAMILY_PENDING_REVOKE_SECURE_KEY,JSON.stringify(row)));},
    async clearPendingRevoke(expectedToken) {await enqueue(async()=>{
      if(expectedToken && parsePending(await kv.getItem(FAMILY_PENDING_REVOKE_SECURE_KEY))?.sessionToken!==expectedToken)return;
      await kv.deleteItem(FAMILY_PENDING_REVOKE_SECURE_KEY);
    });},
  };
}
