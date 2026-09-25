import type { FamilyClock, FamilyIds } from './types';

function randomToken(prefix: string): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}

export function createFamilyIds(): FamilyIds {
  return {
    userId: () => randomToken('usr'),
    familyId: () => randomToken('fam'),
    membershipId: () => randomToken('mem'),
    invitationId: () => randomToken('inv'),
    invitationCode: () => randomToken('code').slice(5),
    sessionToken: () => randomToken('ses'),
  };
}

export function createFamilyClock(): FamilyClock {
  return { now: () => new Date() };
}

export const DEFAULT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
