'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  classifyPublicUrl,
  collectInventory,
  copySqliteFiles,
  evidenceRef,
  fetchAppleJwksMeta,
  looksLikeJwt,
  redactUnknown,
  requestJson,
  restoreSqliteFiles,
  runNpm,
  sqliteMigrationCount,
  sqliteTableNames,
  startFamilyApi,
  stopFamilyApi,
  tmpVolume,
} = require('./family-identity-lib.cjs');

function verdict(status, detail) {
  return { status, detail };
}

async function expectHealth(baseUrl) {
  const response = await requestJson(`${baseUrl}/health`);
  if (response.status !== 200 || response.body?.ok !== true) {
    throw new Error(`health ${response.status}`);
  }
  return response.body?.slice || '';
}

async function callFamily(baseUrl, method, pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;
  const response = await requestJson(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: options.body,
  });
  return {
    status: response.status,
    errorCode: response.body?.error?.code,
    body: redactUnknown(response.body),
    raw: response.body,
  };
}

async function walkIdentityLoop(baseUrl, tokenA, tokenB) {
  const alice = await callFamily(baseUrl, 'POST', '/v1/auth/apple', { body: { identityToken: tokenA } });
  if (alice.status !== 200 || !alice.raw?.sessionToken) {
    return { ok: false, step: 'sign-in-a', alice };
  }
  const bob = await callFamily(baseUrl, 'POST', '/v1/auth/apple', { body: { identityToken: tokenB } });
  if (bob.status !== 200 || !bob.raw?.sessionToken) {
    return { ok: false, step: 'sign-in-b', alice, bob };
  }
  if (alice.raw.userId && alice.raw.userId === bob.raw.userId) {
    return { ok: false, step: 'accounts-not-independent', alice, bob };
  }

  const created = await callFamily(baseUrl, 'POST', '/v1/families', {
    token: alice.raw.sessionToken,
    idempotencyKey: 'accept-create',
  });
  if (created.status !== 200 || !created.raw?.familyId) {
    return { ok: false, step: 'create-family', created };
  }

  const invited = await callFamily(baseUrl, 'POST', `/v1/families/${created.raw.familyId}/invitations`, {
    token: alice.raw.sessionToken,
    idempotencyKey: 'accept-invite',
  });
  if (invited.status !== 200 || !invited.raw?.code) {
    return { ok: false, step: 'invite', invited };
  }

  const joined = await callFamily(baseUrl, 'POST', '/v1/invitations/accept', {
    token: bob.raw.sessionToken,
    body: { code: invited.raw.code },
    idempotencyKey: 'accept-join',
  });
  if (joined.status !== 200) {
    return { ok: false, step: 'join', joined };
  }

  const aliceMembers = await callFamily(baseUrl, 'GET', '/v1/me/membership', { token: alice.raw.sessionToken });
  const bobMembers = await callFamily(baseUrl, 'GET', '/v1/me/membership', { token: bob.raw.sessionToken });
  const aliceCount = aliceMembers.raw?.family?.members?.length;
  const bobCount = bobMembers.raw?.family?.members?.length;
  if (aliceMembers.status !== 200 || bobMembers.status !== 200 || aliceCount !== 2 || bobCount !== 2) {
    return { ok: false, step: 'read-members', aliceMembers, bobMembers };
  }

  const left = await callFamily(baseUrl, 'POST', '/v1/me/leave', { token: bob.raw.sessionToken });
  if (left.status !== 200 || left.raw?.left !== true) {
    return { ok: false, step: 'leave', left };
  }

  const bobAfter = await callFamily(baseUrl, 'GET', '/v1/me/membership', { token: bob.raw.sessionToken });
  const aliceAfter = await callFamily(baseUrl, 'GET', '/v1/me/membership', { token: alice.raw.sessionToken });
  const bobGone = !bobAfter.raw?.family;
  const aliceAlone = aliceAfter.raw?.family?.members?.length === 1;
  const leftover = await callFamily(baseUrl, 'GET', '/v1/me/membership', { token: bob.raw.sessionToken });
  if (!bobGone || !aliceAlone || leftover.raw?.family) {
    return { ok: false, step: 'permission-gone', bobAfter, aliceAfter };
  }

  return {
    ok: true,
    alice: evidenceRef(alice.raw.userId),
    bob: evidenceRef(bob.raw.userId),
    family: evidenceRef(created.raw.familyId),
    memberCounts: { afterJoin: { alice: aliceCount, bob: bobCount }, afterLeave: { alice: 1, bob: 0 } },
  };
}

async function main() {
  const checks = {};
  const inventory = collectInventory();
  checks.inventory = verdict('PASS', 'env presence only; values not printed');

  try {
    const jwks = await fetchAppleJwksMeta();
    checks.apple_jwks_reachable = jwks.status === 200 && jwks.keyCount > 0
      ? verdict('PASS', `http ${jwks.status}, ${jwks.keyCount} keys`)
      : verdict('FAIL', `http ${jwks.status}, ${jwks.keyCount} keys`);
  } catch (error) {
    checks.apple_jwks_reachable = verdict('FAIL', error instanceof Error ? error.message : 'jwks-failed');
  }

  checks.ios_bundle_and_plugin = inventory.app.bundleIdentifier === 'app.lampy.ios' && inventory.app.usesAppleSignIn && inventory.app.hasApplePlugin
    ? verdict('PASS', 'app.json bundleIdentifier app.lampy.ios, usesAppleSignIn, expo-apple-authentication')
    : verdict('FAIL', 'app.json Apple Sign In config missing');

  checks.audience_matches_ios_bundle = inventory.audienceMatchesBundle
    ? verdict('PASS', `audience source ${inventory.appleClientSource}`)
    : verdict('FAIL', 'LAMPY_APPLE_CLIENT_ID does not match app.json bundleIdentifier');

  if (inventory.entitlements.hasAppleSignIn) {
    checks.native_apple_entitlement = verdict('PASS', 'com.apple.developer.applesignin present');
  } else {
    checks.native_apple_entitlement = verdict(
      'NOT VERIFIED',
      inventory.entitlements.present
        ? 'local generated entitlements are empty; Apple Developer Sign in with Apple capability is not confirmed'
        : 'generated ios/ entitlements not in this checkout; Apple Developer capability is not confirmed',
    );
  }

  checks.deploy_templates = inventory.deployFiles.envExample && inventory.deployFiles.unit && inventory.deployFiles.caddy
    ? verdict('PASS', 'env.example, systemd unit, Caddyfile')
    : verdict('FAIL', 'deploy templates missing');

  if (inventory.publicUrl.kind === 'public-http-refused') {
    checks.public_https_service = verdict('FAIL', 'public http URL is refused by the iOS client');
  } else if (inventory.publicUrl.kind === 'public-https' || inventory.publicUrl.kind === 'local-https') {
    try {
      const url = (process.env.LAMPY_FAMILY_ACCEPT_PUBLIC_URL || process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL || '').replace(/\/+$/, '');
      const slice = await expectHealth(url);
      checks.public_https_service = verdict('PASS', `health ok slice=${slice}`);
    } catch (error) {
      checks.public_https_service = verdict('FAIL', error instanceof Error ? error.message : 'public-health-failed');
    }
  } else {
    checks.public_https_service = verdict('NOT VERIFIED', 'no HTTPS family service URL configured');
  }

  checks.hosted_persistent_volume = verdict('NOT VERIFIED', 'no hosted volume credentials or deploy target in this environment');
  checks.app_restart_session_restore = verdict('NOT VERIFIED', 'needs two real devices; client tests are not this check');
  checks.offline_pending_revoke_retry = verdict('NOT VERIFIED', 'needs a real device offline sign-out');
  checks.family_entry_closed = inventory.env.EXPO_PUBLIC_FAMILY_API_BASE_URL === 'UNSET'
    ? verdict('PASS', 'home family entry stays hidden without EXPO_PUBLIC_FAMILY_API_BASE_URL')
    : verdict('FAIL', 'family entry URL is set; do not open this to real users without review');

  const volume = tmpVolume();
  const databasePath = path.join(volume, 'family.db');
  fs.mkdirSync(volume, { recursive: true });

  const migrate = await runNpm(['run', 'family-api:migrate'], { LAMPY_FAMILY_DATABASE_PATH: databasePath });
  const migratedTables = migrate.code === 0 ? sqliteTableNames(databasePath) : [];
  const migratedCount = migrate.code === 0 ? sqliteMigrationCount(databasePath) : 0;
  checks.local_volume_migrate = migrate.code === 0 && migratedCount > 0 && migratedTables.includes('family_accounts')
    ? verdict('PASS', `migrations=${migratedCount} realpath-under-volume=true`)
    : verdict('FAIL', migrate.stderr.trim().split('\n').pop() || 'migrate-failed');

  const refuse = await runNpm(['run', 'family-api'], {
    LAMPY_FAMILY_API_MODE: 'production',
    LAMPY_FAMILY_DATABASE_PATH: databasePath,
    LAMPY_APPLE_CLIENT_ID: inventory.appleClientId,
    LAMPY_FAMILY_API_TEST_TOKENS: 'review-token:apple.review.sub',
    LAMPY_FAMILY_API_PORT: '0',
  });
  checks.production_refuses_test_tokens = refuse.code !== 0 && /TEST_TOKENS/.test(`${refuse.stdout}\n${refuse.stderr}`)
    ? verdict('PASS', 'production listen rejected test tokens')
    : verdict('FAIL', 'production listen did not refuse test tokens');

  let listening;
  try {
    listening = await startFamilyApi({
      LAMPY_FAMILY_API_MODE: 'production',
      LAMPY_FAMILY_DATABASE_PATH: databasePath,
      LAMPY_APPLE_CLIENT_ID: inventory.appleClientId,
      LAMPY_FAMILY_API_HOST: '127.0.0.1',
      LAMPY_FAMILY_API_PORT: '0',
    });
    const baseUrl = `http://127.0.0.1:${listening.port}`;
    await expectHealth(baseUrl);
    const unsigned = await callFamily(baseUrl, 'POST', '/v1/auth/apple', { body: { identityToken: 'not-a-jwt' } });
    checks.unsigned_token_rejected = unsigned.status === 401 && unsigned.errorCode === 'APPLE_TOKEN_INVALID'
      ? verdict('PASS', 'non-JWT identity token rejected')
      : verdict('FAIL', `expected 401 APPLE_TOKEN_INVALID, got ${unsigned.status} ${unsigned.errorCode || ''}`);

    await stopFamilyApi(listening);
    listening = undefined;
    const afterStopCount = sqliteMigrationCount(databasePath);
    listening = await startFamilyApi({
      LAMPY_FAMILY_API_MODE: 'production',
      LAMPY_FAMILY_DATABASE_PATH: databasePath,
      LAMPY_APPLE_CLIENT_ID: inventory.appleClientId,
      LAMPY_FAMILY_API_HOST: '127.0.0.1',
      LAMPY_FAMILY_API_PORT: '0',
    });
    await expectHealth(`http://127.0.0.1:${listening.port}`);
    checks.restart_reads_sqlite = afterStopCount === migratedCount && sqliteMigrationCount(databasePath) === migratedCount
      ? verdict('PASS', `sqlite still on volume after restart, migrations=${afterStopCount}`)
      : verdict('FAIL', 'sqlite missing or migrations changed across restart');

    await stopFamilyApi(listening);
    listening = undefined;
    const backupDir = path.join(volume, 'backup');
    copySqliteFiles(databasePath, backupDir);
    fs.rmSync(databasePath, { force: true });
    fs.rmSync(`${databasePath}-wal`, { force: true });
    fs.rmSync(`${databasePath}-shm`, { force: true });
    restoreSqliteFiles(backupDir, databasePath);
    const restoredCount = sqliteMigrationCount(databasePath);
    listening = await startFamilyApi({
      LAMPY_FAMILY_API_MODE: 'production',
      LAMPY_FAMILY_DATABASE_PATH: databasePath,
      LAMPY_APPLE_CLIENT_ID: inventory.appleClientId,
      LAMPY_FAMILY_API_HOST: '127.0.0.1',
      LAMPY_FAMILY_API_PORT: '0',
    });
    await expectHealth(`http://127.0.0.1:${listening.port}`);
    checks.backup_restore = restoredCount === migratedCount
      ? verdict('PASS', 'stopped-process copy restored and listen accepted the file')
      : verdict('FAIL', 'restored sqlite missing migrations');

    const tokenA = (process.env.LAMPY_FAMILY_ACCEPT_IDENTITY_TOKEN_A || '').trim();
    const tokenB = (process.env.LAMPY_FAMILY_ACCEPT_IDENTITY_TOKEN_B || '').trim();
    if (!tokenA && !tokenB) {
      checks.real_apple_login = verdict('NOT VERIFIED', 'no real Apple identity tokens provided');
      checks.two_account_invite_join_revoke = verdict('NOT VERIFIED', 'need two independent real Apple accounts');
    } else if (!looksLikeJwt(tokenA) || !looksLikeJwt(tokenB)) {
      checks.real_apple_login = verdict('FAIL', 'refused non-JWT / test-token substitute');
      checks.two_account_invite_join_revoke = verdict('FAIL', 'refused to walk membership with test tokens');
    } else if (process.env.LAMPY_FAMILY_API_TEST_TOKENS) {
      checks.real_apple_login = verdict('FAIL', 'LAMPY_FAMILY_API_TEST_TOKENS is set; will not treat this as real Apple');
      checks.two_account_invite_join_revoke = verdict('FAIL', 'test tokens present');
    } else {
      const walked = await walkIdentityLoop(`http://127.0.0.1:${listening.port}`, tokenA, tokenB);
      checks.real_apple_login = walked.ok || walked.step === 'join' || walked.step === 'create-family' || walked.step === 'invite' || walked.step === 'read-members' || walked.step === 'leave' || walked.step === 'permission-gone'
        ? verdict('PASS', 'both identity tokens accepted by JWKS verifier')
        : verdict('FAIL', `stopped at ${walked.step || 'sign-in'}`);
      checks.two_account_invite_join_revoke = walked.ok
        ? verdict('PASS', `invite-join-leave closed; accounts ${walked.alice} ${walked.bob}`)
        : verdict(walked.step && walked.step.startsWith('sign-in') ? 'FAIL' : 'FAIL', `stopped at ${walked.step}`);
    }
  } catch (error) {
    checks.local_single_instance_listen = verdict('FAIL', error instanceof Error ? error.message : 'listen-failed');
    if (!checks.restart_reads_sqlite) checks.restart_reads_sqlite = verdict('FAIL', 'listen did not complete');
    if (!checks.backup_restore) checks.backup_restore = verdict('FAIL', 'listen did not complete');
    if (!checks.real_apple_login) checks.real_apple_login = verdict('NOT VERIFIED', 'local production listen failed before Apple tokens');
    if (!checks.two_account_invite_join_revoke) {
      checks.two_account_invite_join_revoke = verdict('NOT VERIFIED', 'local production listen failed before membership walk');
    }
  } finally {
    await stopFamilyApi(listening);
  }

  if (!checks.local_single_instance_listen) {
    checks.local_single_instance_listen = checks.local_volume_migrate.status === 'PASS' && checks.restart_reads_sqlite?.status === 'PASS'
      ? verdict('PASS', 'single Node process on a local volume; not a hosted deployment')
      : verdict('FAIL', 'local single-instance production listen incomplete');
  }

  const isolation = await runNpm([
    'exec',
    '--',
    'jest',
    'src/application/family-personal-isolation.test.ts',
    'src/application/family-use-cases.test.ts',
    'src/application/image-use-cases.test.ts',
    'src/application/audio-use-cases.test.ts',
    'src/application/history-use-cases.test.ts',
    '--no-coverage',
  ]);
  checks.personal_library_when_family_down = isolation.code === 0
    ? verdict('PASS', 'personal moment / photo / audio / lookback tests passed with family unreachable coverage')
    : verdict('FAIL', 'personal isolation or personal library tests failed');

  const identityAccepted = ['real_apple_login', 'two_account_invite_join_revoke', 'public_https_service', 'hosted_persistent_volume'].every(
    (key) => checks[key]?.status === 'PASS',
  );
  const failed = Object.values(checks).some((item) => item.status === 'FAIL');

  const report = {
    kind: 'family-identity-real-accept',
    baseline: 'origin/main d198a7c68f29e13490032822ca3739b76f5bf849',
    volumeKind: process.env.LAMPY_FAMILY_ACCEPT_VOLUME ? 'provided' : 'ephemeral-local',
    secretsPrinted: false,
    inventory: {
      envPresence: inventory.env,
      publicUrlKind: inventory.publicUrl.kind,
      audienceSource: inventory.appleClientSource,
      bundleIdentifier: inventory.app.bundleIdentifier,
    },
    checks,
    identityLoopAccepted: identityAccepted,
    conclusion: identityAccepted
      ? 'family identity loop accepted for this environment'
      : failed
        ? 'family identity loop not accepted; see FAIL checks'
        : 'family identity loop not accepted; real Apple / hosted HTTPS still NOT VERIFIED',
    openToRealUsers: false,
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
