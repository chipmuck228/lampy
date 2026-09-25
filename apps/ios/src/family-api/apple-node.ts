import { createPublicKey, verify } from 'node:crypto';

import { FAMILY_ERROR, FamilyError } from './errors';
import type { AppleJwk } from './apple';

export async function fetchAppleJwks(): Promise<AppleJwk[]> {
  const response = await fetch('https://appleid.apple.com/auth/keys');
  if (!response.ok) {
    throw new FamilyError(FAMILY_ERROR.APPLE_TOKEN_INVALID, 'Apple JWKS could not be loaded.');
  }
  const body = (await response.json()) as { keys?: AppleJwk[] };
  return Array.isArray(body.keys) ? body.keys : [];
}

export async function verifyAppleJwtSignature(input: {
  signingInput: string;
  signature: Uint8Array;
  jwk: AppleJwk;
}): Promise<boolean> {
  if (!input.jwk.n || !input.jwk.e) return false;
  const key = createPublicKey({
    key: { kty: 'RSA', n: input.jwk.n, e: input.jwk.e },
    format: 'jwk',
  });
  return verify('RSA-SHA256', Buffer.from(input.signingInput), key, Buffer.from(input.signature));
}
