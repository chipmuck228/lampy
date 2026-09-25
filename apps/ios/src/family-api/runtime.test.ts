import { FAMILY_API_PRODUCTION_REFUSED, FAMILY_API_TEST_BANNER, planFamilyApiListen } from './runtime';

describe('family API listen runtime', () => {
  it('refuses production mode before any in-memory store or Apple JWKS fetch', () => {
    expect(() =>
      planFamilyApiListen({
        LAMPY_FAMILY_API_MODE: 'production',
        LAMPY_APPLE_CLIENT_ID: 'com.example.not.used',
        LAMPY_FAMILY_API_TEST_TOKENS: 'should-not-enable:apple.sub',
      }),
    ).toThrow(FAMILY_API_PRODUCTION_REFUSED);
  });

  it('allows test mode with in-memory store and never treats test tokens as production', () => {
    const plan = planFamilyApiListen({
      LAMPY_FAMILY_API_MODE: 'test',
      LAMPY_FAMILY_API_TEST_TOKENS: 'review-token:apple.review.sub',
    });
    expect(plan).toEqual({
      mode: 'test',
      store: 'memory',
      testTokens: { 'review-token': { appleSubject: 'apple.review.sub' } },
      banner: FAMILY_API_TEST_BANNER,
    });
    expect(plan.banner).toMatch(/in-memory/i);
    expect(plan.banner).toMatch(/NOT a production deploy/);
  });

  it('does not start when mode is unset', () => {
    expect(() => planFamilyApiListen({})).toThrow(/LAMPY_FAMILY_API_MODE=test/);
  });
});
