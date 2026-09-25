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

export function createSecureFamilySessionStore(
  kv: SecureKv = {
    getItem: (key) => SecureStore.getItemAsync(key),
    setItem: (key, value) => SecureStore.setItemAsync(key, value),
    deleteItem: (key) => SecureStore.deleteItemAsync(key),
  },
): FamilySessionStore {
  return {
    async getSessionToken() {
      return parseStored(await kv.getItem(FAMILY_SESSION_SECURE_KEY))?.sessionToken ?? null;
    },
    async getUserId() {
      return parseStored(await kv.getItem(FAMILY_SESSION_SECURE_KEY))?.userId ?? null;
    },
    async setSession(session) {
      await kv.setItem(FAMILY_SESSION_SECURE_KEY, JSON.stringify(session));
    },
    async clearSession() {
      await kv.deleteItem(FAMILY_SESSION_SECURE_KEY);
    },
    async getPendingRevoke() {
      return parsePending(await kv.getItem(FAMILY_PENDING_REVOKE_SECURE_KEY));
    },
    async savePendingRevoke(row) {
      await kv.setItem(FAMILY_PENDING_REVOKE_SECURE_KEY, JSON.stringify(row));
    },
    async clearPendingRevoke() {
      await kv.deleteItem(FAMILY_PENDING_REVOKE_SECURE_KEY);
    },
  };
}
