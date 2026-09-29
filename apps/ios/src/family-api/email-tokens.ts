import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const EMAIL_RESET_TTL_MS = 60 * 60 * 1000;

export type EmailTokenPurpose = 'verify' | 'reset';

export function createEmailTokenSecret() {
  return bytesToHex(randomBytes(32));
}

export function hashEmailTokenSecret(secret: string) {
  return bytesToHex(sha256(utf8ToBytes(secret)));
}
