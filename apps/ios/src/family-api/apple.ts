import { FAMILY_ERROR, FamilyError } from './errors';
import type { AppleIdentity, AppleVerifier, FamilyClock } from './types';

export function createMapAppleVerifier(tokens: Record<string, AppleIdentity>): AppleVerifier {
  return {
    async verifyIdentityToken(identityToken: string) {
      const identity = tokens[identityToken];
      if (!identity) {
        throw new FamilyError(FAMILY_ERROR.APPLE_TOKEN_INVALID, 'Apple identity token is invalid.');
      }
      return identity;
    },
  };
}

export type AppleJwtClaims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  sub?: string;
  email?: string;
};

export type AppleJwk = {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
  alg?: string;
};

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = globalThis.atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJson<T>(value: string): T {
  const bytes = decodeBase64Url(value);
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return JSON.parse(text) as T;
}

export function parseJwtParts(token: string): { header: { alg?: string; kid?: string }; payload: AppleJwtClaims; signingInput: string; signature: Uint8Array } {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new FamilyError(FAMILY_ERROR.APPLE_TOKEN_INVALID, 'Apple identity token is invalid.');
  }
  return {
    header: decodeJson(parts[0]),
    payload: decodeJson(parts[1]),
    signingInput: `${parts[0]}.${parts[1]}`,
    signature: decodeBase64Url(parts[2]),
  };
}

function audienceMatches(aud: string | string[] | undefined, expected: string) {
  if (Array.isArray(aud)) return aud.includes(expected);
  return aud === expected;
}

export function assertAppleClaims(claims: AppleJwtClaims, audience: string, now: Date) {
  if (claims.iss !== 'https://appleid.apple.com') {
    throw new FamilyError(FAMILY_ERROR.APPLE_TOKEN_INVALID, 'Apple identity token issuer is invalid.');
  }
  if (!audienceMatches(claims.aud, audience)) {
    throw new FamilyError(FAMILY_ERROR.APPLE_TOKEN_INVALID, 'Apple identity token audience is invalid.');
  }
  if (!claims.sub) {
    throw new FamilyError(FAMILY_ERROR.APPLE_TOKEN_INVALID, 'Apple identity token subject is missing.');
  }
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now.getTime()) {
    throw new FamilyError(FAMILY_ERROR.APPLE_TOKEN_INVALID, 'Apple identity token has expired.');
  }
}

export function createAppleJwksVerifier(options: {
  audience: string;
  fetchJwks: () => Promise<AppleJwk[]>;
  verifySignature: (input: { signingInput: string; signature: Uint8Array; jwk: AppleJwk }) => Promise<boolean>;
  clock?: FamilyClock;
}): AppleVerifier {
  const audience = options.audience.trim();
  if (!audience) {
    throw new FamilyError(FAMILY_ERROR.APPLE_TOKEN_INVALID, 'Apple client id is not configured.');
  }

  return {
    async verifyIdentityToken(identityToken: string) {
      const parsed = parseJwtParts(identityToken);
      if (parsed.header.alg !== 'RS256') {
        throw new FamilyError(FAMILY_ERROR.APPLE_TOKEN_INVALID, 'Apple identity token algorithm is invalid.');
      }
      assertAppleClaims(parsed.payload, audience, (options.clock ?? { now: () => new Date() }).now());
      const keys = await options.fetchJwks();
      const jwk = keys.find((key) => key.kid === parsed.header.kid && key.kty === 'RSA');
      if (!jwk) {
        throw new FamilyError(FAMILY_ERROR.APPLE_TOKEN_INVALID, 'Apple identity token key is unknown.');
      }
      const ok = await options.verifySignature({
        signingInput: parsed.signingInput,
        signature: parsed.signature,
        jwk,
      });
      if (!ok) {
        throw new FamilyError(FAMILY_ERROR.APPLE_TOKEN_INVALID, 'Apple identity token signature is invalid.');
      }
      return {
        appleSubject: parsed.payload.sub as string,
        email: parsed.payload.email,
      };
    },
  };
}
