export type FamilyApiListenEnv = {
  LAMPY_FAMILY_API_MODE?: string;
  LAMPY_FAMILY_API_TEST_TOKENS?: string;
  LAMPY_APPLE_CLIENT_ID?: string;
  LAMPY_FAMILY_DATABASE_PATH?: string;
};

export type FamilyApiListenPlan =
  | {
      mode: 'test';
      store: 'memory';
      apple: 'test-tokens';
      testTokens: Record<string, { appleSubject: string; email?: string }>;
      banner: string;
    }
  | {
      mode: 'production';
      store: 'sqlite';
      apple: 'jwks';
      databasePath: string;
      appleClientId: string;
      banner: string;
    };

export const FAMILY_API_PRODUCTION_REFUSED_MEMORY =
  'LAMPY_FAMILY_API_MODE=production is refused without a durable family database. Set LAMPY_FAMILY_DATABASE_PATH to a SQLite file, apply migrations, and configure LAMPY_APPLE_CLIENT_ID. Test tokens must stay unset.';

export const FAMILY_API_PRODUCTION_REFUSES_TEST_TOKENS =
  'LAMPY_FAMILY_API_TEST_TOKENS cannot be set in production. Test tokens must never be used as production members.';

export const FAMILY_API_PRODUCTION_NEEDS_APPLE_CLIENT =
  'LAMPY_APPLE_CLIENT_ID is required in production so Apple identity tokens can be verified.';

export const FAMILY_API_TEST_BANNER =
  'Lampy family API test mode: in-memory only, lost on process restart, NOT a production deploy. Test tokens must never be used as production members.';

export const FAMILY_API_PRODUCTION_BANNER =
  'Lampy family API production mode: SQLite family store with migrations and Apple JWKS verification. Do not enable test tokens.';

export function parseFamilyApiTestTokens(raw: string | undefined) {
  const tokens: Record<string, { appleSubject: string; email?: string }> = {};
  if (!raw) return tokens;
  for (const item of raw.split(',')) {
    const [token, subject, email] = item.split(':').map((part) => part.trim());
    if (token && subject) {
      tokens[token] = { appleSubject: subject, email: email || undefined };
    }
  }
  return tokens;
}

export function planFamilyApiListen(env: FamilyApiListenEnv): FamilyApiListenPlan {
  const mode = env.LAMPY_FAMILY_API_MODE || 'unset';
  if (mode === 'production') {
    const testTokens = parseFamilyApiTestTokens(env.LAMPY_FAMILY_API_TEST_TOKENS);
    if (Object.keys(testTokens).length) {
      throw new Error(FAMILY_API_PRODUCTION_REFUSES_TEST_TOKENS);
    }
    const databasePath = (env.LAMPY_FAMILY_DATABASE_PATH || '').trim();
    if (!databasePath) {
      throw new Error(FAMILY_API_PRODUCTION_REFUSED_MEMORY);
    }
    const appleClientId = (env.LAMPY_APPLE_CLIENT_ID || '').trim();
    if (!appleClientId) {
      throw new Error(FAMILY_API_PRODUCTION_NEEDS_APPLE_CLIENT);
    }
    return {
      mode: 'production',
      store: 'sqlite',
      apple: 'jwks',
      databasePath,
      appleClientId,
      banner: FAMILY_API_PRODUCTION_BANNER,
    };
  }
  if (mode !== 'test') {
    throw new Error(
      'Set LAMPY_FAMILY_API_MODE=test with LAMPY_FAMILY_API_TEST_TOKENS for local in-memory review, or production with LAMPY_FAMILY_DATABASE_PATH and LAMPY_APPLE_CLIENT_ID.',
    );
  }
  const testTokens = parseFamilyApiTestTokens(env.LAMPY_FAMILY_API_TEST_TOKENS);
  if (!Object.keys(testTokens).length) {
    throw new Error('LAMPY_FAMILY_API_TEST_TOKENS is required in test mode (token:appleSubject[,...]).');
  }
  return {
    mode: 'test',
    store: 'memory',
    apple: 'test-tokens',
    testTokens,
    banner: FAMILY_API_TEST_BANNER,
  };
}
