import { assertAppleClaims, createAppleJwksVerifier, parseJwtParts } from './apple';

function encode(value: object) {
  const json = JSON.stringify(value);
  return globalThis.btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function jwt(header: object, payload: object) {
  return `${encode(header)}.${encode(payload)}.c2ln`;
}

const now = new Date('2026-09-25T02:00:00.000Z');
const validPayload = {
  iss: 'https://appleid.apple.com',
  aud: 'app.lampy.ios',
  exp: Math.floor(new Date('2026-09-25T03:00:00.000Z').getTime() / 1000),
  sub: 'apple.sub.1',
};

describe('Apple identity token verification', () => {
  it('rejects a test token that is not a signed Apple JWT', () => {
    expect(() => parseJwtParts('review-token')).toThrow(/invalid/);
  });

  it('rejects issuer, audience, expiry, and missing subject failures', () => {
    expect(() => assertAppleClaims({ ...validPayload, iss: 'https://example.com' }, 'app.lampy.ios', now)).toThrow(
      /issuer/,
    );
    expect(() => assertAppleClaims({ ...validPayload, aud: 'other.app' }, 'app.lampy.ios', now)).toThrow(/audience/);
    expect(() =>
      assertAppleClaims({ ...validPayload, exp: Math.floor(now.getTime() / 1000) }, 'app.lampy.ios', now),
    ).toThrow(/expired/);
    expect(() => assertAppleClaims({ ...validPayload, sub: undefined }, 'app.lampy.ios', now)).toThrow(/subject/);
  });

  it('accepts a token only when issuer, audience, expiry, subject, and signature match', async () => {
    const verifier = createAppleJwksVerifier({
      audience: 'app.lampy.ios',
      clock: { now: () => now },
      fetchJwks: async () => [{ kid: 'kid1', kty: 'RSA', n: 'n', e: 'AQAB' }],
      verifySignature: async () => true,
    });
    await expect(
      verifier.verifyIdentityToken(jwt({ alg: 'RS256', kid: 'kid1' }, validPayload)),
    ).resolves.toEqual({ appleSubject: 'apple.sub.1' });
  });

  it('rejects an unknown key or a failed signature', async () => {
    const verifier = createAppleJwksVerifier({
      audience: 'app.lampy.ios',
      clock: { now: () => now },
      fetchJwks: async () => [{ kid: 'kid1', kty: 'RSA', n: 'n', e: 'AQAB' }],
      verifySignature: async () => false,
    });
    await expect(
      verifier.verifyIdentityToken(jwt({ alg: 'RS256', kid: 'other' }, validPayload)),
    ).rejects.toThrow(/unknown/);
    await expect(
      verifier.verifyIdentityToken(jwt({ alg: 'RS256', kid: 'kid1' }, validPayload)),
    ).rejects.toThrow(/signature/);
  });
});
