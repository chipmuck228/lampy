import {
  FAMILY_API_PRODUCTION_BANNER,
  FAMILY_API_PRODUCTION_NEEDS_APPLE_CLIENT,
  FAMILY_API_PRODUCTION_REFUSED_MEMORY,
  FAMILY_API_PRODUCTION_REFUSES_TEST_TOKENS,
  FAMILY_API_TEST_BANNER,
  planFamilyApiListen,
} from './runtime';

describe('family API listen runtime', () => {
  it('refuses production without a durable database path', () => {
    expect(() =>
      planFamilyApiListen({
        LAMPY_FAMILY_API_MODE: 'production',
        LAMPY_APPLE_CLIENT_ID: 'app.lampy.ios',
      }),
    ).toThrow(FAMILY_API_PRODUCTION_REFUSED_MEMORY);
  });

  it('refuses production when test tokens are present', () => {
    expect(() =>
      planFamilyApiListen({
        LAMPY_FAMILY_API_MODE: 'production',
        LAMPY_FAMILY_DATABASE_PATH: '/tmp/lampy-family.db',
        LAMPY_APPLE_CLIENT_ID: 'app.lampy.ios',
        LAMPY_FAMILY_API_TEST_TOKENS: 'should-not-enable:apple.sub',
      }),
    ).toThrow(FAMILY_API_PRODUCTION_REFUSES_TEST_TOKENS);
  });

  it('refuses production without an Apple client id', () => {
    expect(() =>
      planFamilyApiListen({
        LAMPY_FAMILY_API_MODE: 'production',
        LAMPY_FAMILY_DATABASE_PATH: '/tmp/lampy-family.db',
      }),
    ).toThrow(FAMILY_API_PRODUCTION_NEEDS_APPLE_CLIENT);
  });

  it('allows production only with sqlite path, Apple client id, and no test tokens', () => {
    const plan = planFamilyApiListen({
      LAMPY_FAMILY_API_MODE: 'production',
      LAMPY_FAMILY_DATABASE_PATH: '/tmp/lampy-family.db',
      LAMPY_APPLE_CLIENT_ID: 'app.lampy.ios',
    });
    expect(plan).toEqual({
      mode: 'production',
      store: 'sqlite',
      apple: 'jwks',
      databasePath: '/tmp/lampy-family.db',
      appleClientId: 'app.lampy.ios',
      banner: FAMILY_API_PRODUCTION_BANNER,
    });
  });

  it('allows test mode with in-memory store and never treats test tokens as production', () => {
    const plan = planFamilyApiListen({
      LAMPY_FAMILY_API_MODE: 'test',
      LAMPY_FAMILY_API_TEST_TOKENS: 'review-token:apple.review.sub',
    });
    expect(plan).toEqual({
      mode: 'test',
      store: 'memory',
      apple: 'test-tokens',
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
