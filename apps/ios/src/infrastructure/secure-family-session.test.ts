import {
  createSecureFamilySessionStore,
  FAMILY_PENDING_REVOKE_SECURE_KEY,
  FAMILY_SESSION_SECURE_KEY,
} from './secure-family-session';

describe('secure family session store', () => {
  it('restores userId and session token after a new store instance reads the same key', async () => {
    const memory = new Map<string, string>();
    const kv = {
      async getItem(key: string) {
        return memory.get(key) ?? null;
      },
      async setItem(key: string, value: string) {
        memory.set(key, value);
      },
      async deleteItem(key: string) {
        memory.delete(key);
      },
    };
    const first = createSecureFamilySessionStore(kv);
    await first.setSession({ userId: 'usr_alice', sessionToken: 'ses_alice' });
    expect(memory.get(FAMILY_SESSION_SECURE_KEY)).toContain('usr_alice');
    expect(JSON.stringify(Object.fromEntries(memory)).includes('ses_alice')).toBe(true);

    const rebuilt = createSecureFamilySessionStore(kv);
    expect(await rebuilt.getUserId()).toBe('usr_alice');
    expect(await rebuilt.getSessionToken()).toBe('ses_alice');
    await rebuilt.clearSession();
    expect(await rebuilt.getSessionToken()).toBeNull();
    expect(memory.has(FAMILY_SESSION_SECURE_KEY)).toBe(false);
  });

  it('keeps a pending revoke only in the secure revoke key after the live session is cleared', async () => {
    const memory = new Map<string, string>();
    const kv = {
      async getItem(key: string) {
        return memory.get(key) ?? null;
      },
      async setItem(key: string, value: string) {
        memory.set(key, value);
      },
      async deleteItem(key: string) {
        memory.delete(key);
      },
    };
    const store = createSecureFamilySessionStore(kv);
    await store.setSession({ userId: 'usr_alice', sessionToken: 'ses_live' });
    await store.savePendingRevoke({
      userId: 'usr_alice',
      sessionToken: 'ses_pending',
      createdAt: '2026-09-25T02:00:00.000Z',
    });
    await store.clearSession();
    expect(memory.has(FAMILY_SESSION_SECURE_KEY)).toBe(false);
    expect(memory.has(FAMILY_PENDING_REVOKE_SECURE_KEY)).toBe(true);
    const rebuilt = createSecureFamilySessionStore(kv);
    expect(await rebuilt.getSessionToken()).toBeNull();
    expect(await rebuilt.getPendingRevoke()).toEqual({
      userId: 'usr_alice',
      sessionToken: 'ses_pending',
      createdAt: '2026-09-25T02:00:00.000Z',
    });
    await rebuilt.clearPendingRevoke();
    expect(memory.has(FAMILY_PENDING_REVOKE_SECURE_KEY)).toBe(false);
  });
});
