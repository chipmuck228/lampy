import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request } from 'node:http';
import { createFamilyCommands } from './commands';
import { createMapAppleVerifier } from './apple';
import { createFamilyStore } from './store';
import { ARGON2ID_TEST, createArgon2idPasswordHasher } from './password';
import { createPublicAuthAdmission, publicTestAuthPlan, publicTestPeer, isPublicAuthRequest, publicAuthBodyDeadline } from './public-test-auth';
import { startFamilyApiServer } from './listen';
import { openFamilySqliteDatabase } from './node-db';
import { applyFamilyApiSchema } from './schema';
import { runTestAccountCli } from './test-account-cli';

const publicEnv = { LAMPY_FAMILY_API_MODE: 'production', LAMPY_FAMILY_API_HOST: '127.0.0.1', LAMPY_PUBLIC_TEST_LOGIN: '1', LAMPY_PUBLIC_TEST_TRUST_LOOPBACK_PROXY: '1', LAMPY_APPLE_CLIENT_ID: 'app.lampy.ios' };
const password = 'test-password-only';
function fixture() {
  const store = createFamilyStore();
  return { store, commands: createFamilyCommands({ store, apple: createMapAppleVerifier({}), publicTestLoginEnabled: true, passwordHasher: createArgon2idPasswordHasher(ARGON2ID_TEST) }) };
}
function json(port: number, route: string, body: unknown, peer?: string) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path: route, method: 'POST', headers: { 'content-type': 'application/json', ...(peer ? { 'x-lampy-client-ip': peer } : {}) } }, res => {
      const chunks: Buffer[] = []; res.on('data', c => chunks.push(Buffer.from(c)));
      res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    }); req.on('error', reject); req.end(JSON.stringify(body));
  });
}
it('fails closed for missing proxy configuration, public binding, and mixed legacy gates', () => {
  expect(publicTestAuthPlan(publicEnv).enabled).toBe(true);
  for (const override of [{ LAMPY_FAMILY_API_HOST: '0.0.0.0' }, { LAMPY_PUBLIC_TEST_TRUST_LOOPBACK_PROXY: '0' }, { LAMPY_TEST_ACCOUNT_LOGIN: 'yes' }, { LAMPY_CONTROLLED_EMAIL_ACCOUNTS: '1' }, { LAMPY_FAMILY_API_MODE: 'test' }]) {
    expect(() => publicTestAuthPlan({ ...publicEnv, ...override })).toThrow();
  }
  expect(publicTestAuthPlan({}).enabled).toBe(false);
});
it('accepts only a single valid IP from loopback, normalizes mapped IPv4, rejects chains and remote peers', () => {
  expect(publicTestPeer('127.0.0.1', '203.0.113.7')).toBe('203.0.113.7');
  expect(publicTestPeer('::1', '::ffff:203.0.113.7')).toBe('203.0.113.7');
  expect(publicTestPeer('203.0.113.1', '203.0.113.7')).toBeUndefined();
  for (const raw of [undefined, ['203.0.113.7'], '203.0.113.7, 1.1.1.1', 'invalid']) expect(publicTestPeer('127.0.0.1', raw)).toBeUndefined();
});
it('bounds authentication admission and releases each slot only once', () => {
  const admit = createPublicAuthAdmission(2); const a = admit()!; const b = admit()!;
  expect(admit()).toBeUndefined(); a(); a(); const c = admit()!;
  expect(admit()).toBeUndefined(); b(); c(); expect(admit()).toBeDefined();
});
it('only operator-created accounts can log in; registration, legacy and Apple sign-in stay closed', async () => {
  const { commands, store } = fixture();
  await commands.createTestAccount('person@example.com', password);
  await expect(commands.registerControlledEmail({ email: 'new@example.com', password, nickname: '名字' })).rejects.toMatchObject({ code: 'EMAIL_ACCOUNT_CLOSED' });
  await expect(commands.signInWithTestAccount({ login: 'person@example.com', password })).rejects.toMatchObject({ code: 'TEST_ACCOUNT_LOGIN_CLOSED' });
  await expect(commands.signInWithApple('valid-or-invalid')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  const result = await commands.signInWithControlledEmail({ email: 'PERSON@example.com', password }, '203.0.113.1');
  await commands.updateMyProfile(result.sessionToken, '窗边');
  expect((await commands.getMyProfile(result.sessionToken)).nickname).toBe('窗边');
  expect(store.accounts).toHaveLength(1);
  expect(commands.health()).toMatchObject({ controlledEmailAccounts: true, emailRegistration: false, testAccountLogin: false, publicTestLogin: true });
});
it('wrong, unknown and disabled accounts give the same failure; peer and account limits apply', async () => {
  const { commands } = fixture(); await commands.createTestAccount('person@example.com', password);
  const errors: string[] = [];
  for (const email of ['person@example.com', 'absent@example.com']) {
    try { await commands.signInWithControlledEmail({ email, password: 'wrong' }, '203.0.113.1'); } catch (e) { errors.push((e as Error).message); }
  }
  await commands.disableTestAccount('person@example.com');
  try { await commands.signInWithControlledEmail({ email: 'person@example.com', password }, '203.0.113.1'); } catch (e) { errors.push((e as Error).message); }
  expect(new Set(errors).size).toBe(1);
  for (let i = 0; i < 5; i++) await expect(commands.signInWithControlledEmail({ email: `missing${i}@example.com`, password }, '203.0.113.1')).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  await expect(commands.signInWithControlledEmail({ email: 'another@example.com', password }, '203.0.113.1')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  const second = fixture().commands;
  for (let i = 0; i < 8; i++) await expect(second.signInWithControlledEmail({ email: 'same@example.com', password }, `203.0.113.${i}`)).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  await expect(second.signInWithControlledEmail({ email: 'same@example.com', password }, '203.0.113.99')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
});
it('revokes every session without disabling the account, while disable forbids a new login', async () => {
  const { commands } = fixture(); await commands.createTestAccount('person@example.com', password);
  const a = await commands.signInWithControlledEmail({ email: 'person@example.com', password }, 'a');
  const b = await commands.signInWithControlledEmail({ email: 'person@example.com', password }, 'b');
  await commands.revokeTestAccountSessions('person@example.com');
  for (const session of [a, b]) await expect(commands.getMyProfile(session.sessionToken)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  const c = await commands.signInWithControlledEmail({ email: 'person@example.com', password }, 'c');
  await commands.disableTestAccount('person@example.com');
  await expect(commands.getMyProfile(c.sessionToken)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  await expect(commands.signInWithControlledEmail({ email: 'person@example.com', password }, 'd')).rejects.toMatchObject({ code: 'AUTH_FAILED' });
});
it('SQLite operator CLI and real listener survive restart, limit by trusted peer and reject missing headers', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lampy-public-auth-'));
  const databasePath = path.join(dir, 'family.sqlite');
  const db = openFamilySqliteDatabase(databasePath); await applyFamilyApiSchema(db); await db.close();
  const cli = (action: string) => runTestAccountCli({ argv: ['node', 'cli', action, 'person@example.com'], env: { LAMPY_FAMILY_DATABASE_PATH: databasePath }, readPassword: async () => password, passwordHasher: createArgon2idPasswordHasher(ARGON2ID_TEST) });
  let server: Awaited<ReturnType<typeof startFamilyApiServer>> | undefined;
  const start = () => startFamilyApiServer({ port: 0, env: { ...publicEnv, LAMPY_FAMILY_DATABASE_PATH: databasePath } });
  try {
    await cli('create');
    await runTestAccountCli({ argv: ['node', 'cli', 'create', 'limit@example.com'], env: { LAMPY_FAMILY_DATABASE_PATH: databasePath }, readPassword: async () => password, passwordHasher: createArgon2idPasswordHasher(ARGON2ID_TEST) });
    server = await start();
    const input = { email: 'person@example.com', password };
    expect((await json(server.port, '/v2/auth/email/login', input)).status).toBe(403);
    expect((await json(server.port, '/v2/auth/email/register', { ...input, nickname: '名字' }, '203.0.113.1')).status).toBe(503);
    expect((await json(server.port, '/v1/auth/test-account', { login: input.email, password }, '203.0.113.1')).status).toBe(503);
    expect((await json(server.port, '/v2/auth/email/login', input, '203.0.113.1')).status).toBe(200);
    await cli('revoke-sessions'); await server.close(); server = await start();
    expect((await json(server.port, '/v2/auth/email/login', input, '203.0.113.1')).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await json(server.port, '/v2/auth/email/login', { email: 'limit@example.com', password: 'wrong' }, '203.0.113.2')).status).toBe(401);
    await server.close(); server = await start();
    for (let i = 4; i < 8; i++) expect((await json(server.port, '/v2/auth/email/login', { email: 'limit@example.com', password: 'wrong' }, '203.0.113.2')).status).toBe(401);
    expect((await json(server.port, '/v2/auth/email/login', input, '203.0.113.2')).status).toBe(429);
    await cli('disable'); await server.close(); server = await start();
    expect((await json(server.port, '/v2/auth/email/login', input, '203.0.113.1')).status).toBe(401);
  } finally { await server?.close(); await rm(dir, { recursive: true, force: true }); }
}, 30_000);
it('does not promote old self-registration or accept its existing session in public mode', async () => {
  const store = createFamilyStore();
  const shared = { store, apple: createMapAppleVerifier({}), passwordHasher: createArgon2idPasswordHasher(ARGON2ID_TEST) };
  const legacy = createFamilyCommands({ ...shared, testAccountLoginEnabled: true, controlledEmailAccountsEnabled: true });
  const old = await legacy.registerControlledEmail({ email: 'legacy@example.com', password, nickname: '原昵称' });
  const commands = createFamilyCommands({ ...shared, publicTestLoginEnabled: true });
  await expect(commands.signInWithControlledEmail({ email: 'legacy@example.com', password }, 'peer')).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  await expect(commands.getMyProfile(old.sessionToken)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  expect(store.accounts).toHaveLength(1);
  expect(store.profiles[0].nickname).toBe('原昵称');
  expect(store.testCredentials[0].operatorProvisioned).not.toBe(true);
});
it('migration 27 preserves old credentials and marks them unprovisioned, and is idempotent', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lampy-public-migration-'));
  const db = openFamilySqliteDatabase(path.join(dir, 'family.sqlite'));
  try {
    await applyFamilyApiSchema(db, { upTo: 26 });
    await db.run('INSERT INTO family_accounts(user_id,created_at) VALUES (?,?)', ['old-user', '2026-01-01T00:00:00Z']);
    await db.run('INSERT INTO family_test_credentials(credential_id,login_normalized,user_id,password_hash,enabled,created_at) VALUES (?,?,?,?,?,?)', ['old-credential', 'old@example.com', 'old-user', 'old-hash', 1, '2026-01-01T00:00:00Z']);
    await applyFamilyApiSchema(db); await applyFamilyApiSchema(db);
    expect(await db.getFirst('SELECT user_id,password_hash,enabled,operator_provisioned FROM family_test_credentials')).toEqual({ user_id: 'old-user', password_hash: 'old-hash', enabled: 1, operator_provisioned: 0 });
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
});

it('uses the same normalized method for every auth gate', () => {
  for (const method of ['POST', 'post', 'Post', 'pOsT']) expect(isPublicAuthRequest(method, '/v2/auth/email/login')).toBe(true);
  expect(isPublicAuthRequest('GET', '/v2/auth/email/login')).toBe(false);
});
it('body timeout can abort a slow body but cannot abort queued authentication after body completion', () => {
  jest.useFakeTimers();
  try {
    const destroy = jest.fn();
    const finishBody = publicAuthBodyDeadline(destroy);
    jest.advanceTimersByTime(9999); expect(destroy).not.toHaveBeenCalled();
    finishBody(); jest.advanceTimersByTime(60_000); expect(destroy).not.toHaveBeenCalled();
    publicAuthBodyDeadline(destroy); jest.advanceTimersByTime(10_000); expect(destroy).toHaveBeenCalledTimes(1);
  } finally { jest.useRealTimers(); }
});
