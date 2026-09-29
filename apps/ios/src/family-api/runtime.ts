export type FamilyApiListenEnv = {
  LAMPY_FAMILY_API_MODE?: string;
  LAMPY_FAMILY_API_TEST_TOKENS?: string;
  LAMPY_APPLE_CLIENT_ID?: string;
  LAMPY_FAMILY_DATABASE_PATH?: string;
  LAMPY_EMAIL_REGISTER_ENABLED?: string;
  LAMPY_EMAIL_MAILER?: string;
  LAMPY_EMAIL_SMTP_HOST?: string;
  LAMPY_EMAIL_SMTP_PORT?: string;
  LAMPY_EMAIL_SMTP_USER?: string;
  LAMPY_EMAIL_SMTP_PASS?: string;
  LAMPY_EMAIL_FROM?: string;
};

export type FamilyEmailListenPlan = {
  emailRegisterEnabled: boolean;
  emailRegisterReason: 'enabled' | 'account-delete-incomplete' | 'mail-unconfigured' | 'explicitly-disabled';
  mailer: 'smtp' | 'memory' | 'none';
};

export type FamilyApiListenPlan =
  | {
      mode: 'test';
      store: 'memory';
      apple: 'test-tokens';
      testTokens: Record<string, { appleSubject: string; email?: string }>;
      banner: string;
      email: FamilyEmailListenPlan;
    }
  | {
      mode: 'production';
      store: 'sqlite';
      apple: 'jwks';
      databasePath: string;
      appleClientId: string;
      banner: string;
      email: FamilyEmailListenPlan;
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

export const FAMILY_API_PRODUCTION_REFUSES_MEMORY_MAILER =
  'LAMPY_EMAIL_MAILER=memory cannot enable production email register. Configure SMTP or keep email register closed.';

export function planFamilyEmailListen(env: FamilyApiListenEnv, mode: 'test' | 'production'): FamilyEmailListenPlan {
  const want = /^(1|true|yes)$/i.test((env.LAMPY_EMAIL_REGISTER_ENABLED || '').trim());
  const mailerName = (env.LAMPY_EMAIL_MAILER || '').trim().toLowerCase();
  const smtpReady = Boolean(
    (env.LAMPY_EMAIL_SMTP_HOST || '').trim() &&
      (env.LAMPY_EMAIL_SMTP_USER || '').trim() &&
      env.LAMPY_EMAIL_SMTP_PASS &&
      (env.LAMPY_EMAIL_FROM || '').trim(),
  );
  if (mode === 'production' && mailerName === 'memory') {
    return { emailRegisterEnabled: false, emailRegisterReason: 'mail-unconfigured', mailer: 'none' };
  }
  if (!want) {
    return {
      emailRegisterEnabled: false,
      emailRegisterReason: 'account-delete-incomplete',
      mailer: smtpReady ? 'smtp' : mailerName === 'memory' && mode === 'test' ? 'memory' : 'none',
    };
  }
  if (mode === 'test' && mailerName === 'memory') {
    return { emailRegisterEnabled: true, emailRegisterReason: 'enabled', mailer: 'memory' };
  }
  if (smtpReady) {
    return { emailRegisterEnabled: true, emailRegisterReason: 'enabled', mailer: 'smtp' };
  }
  return { emailRegisterEnabled: false, emailRegisterReason: 'mail-unconfigured', mailer: 'none' };
}

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
      email: planFamilyEmailListen(env, 'production'),
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
    email: planFamilyEmailListen(env, 'test'),
  };
}
