export type FamilyApiListenEnv = {
  LAMPY_FAMILY_API_MODE?: string;
  LAMPY_FAMILY_API_TEST_TOKENS?: string;
  LAMPY_APPLE_CLIENT_ID?: string;
};

export type FamilyApiListenPlan = {
  mode: 'test';
  store: 'memory';
  testTokens: Record<string, { appleSubject: string; email?: string }>;
  banner: string;
};

export const FAMILY_API_PRODUCTION_REFUSED =
  'LAMPY_FAMILY_API_MODE=production is refused. This process still uses an in-memory family store with no transactional database; membership would be lost on restart. Apple JWT verification alone does not make a production family backend. Do not deploy this listen process as production.';

export const FAMILY_API_TEST_BANNER =
  'Lampy family API test mode: in-memory only, lost on process restart, NOT a production deploy. Test tokens must never be used as production members.';

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
    throw new Error(FAMILY_API_PRODUCTION_REFUSED);
  }
  if (mode !== 'test') {
    throw new Error(
      'Set LAMPY_FAMILY_API_MODE=test with LAMPY_FAMILY_API_TEST_TOKENS for local in-memory review only. Production mode is refused until a durable family database exists.',
    );
  }
  const testTokens = parseFamilyApiTestTokens(env.LAMPY_FAMILY_API_TEST_TOKENS);
  if (!Object.keys(testTokens).length) {
    throw new Error('LAMPY_FAMILY_API_TEST_TOKENS is required in test mode (token:appleSubject[,...]).');
  }
  return {
    mode: 'test',
    store: 'memory',
    testTokens,
    banner: FAMILY_API_TEST_BANNER,
  };
}
