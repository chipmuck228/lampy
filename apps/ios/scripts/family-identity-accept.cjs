'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  IOS_ROOT,
  collectInventory,
  fetchAppleJwksMeta,
  requestJson,
  runNpm,
  sqliteMigrationCount,
  sqliteTableNames,
  startFamilyApi,
  stopFamilyApi,
  tmpVolume,
} = require('./family-identity-lib.cjs');
const { isAuthorizedDeployedUrl, tokenPairStatus, walkIdentityLoop } = require('./family-identity-walk.cjs');
const {
  inspectHostedVolume,
  loadVolumeProbeFile,
  validateHostedVolumeProbe,
} = require('./family-identity-volume.cjs');

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

function readTokens() {
  return {
    tokenA: (process.env.LAMPY_FAMILY_ACCEPT_IDENTITY_TOKEN_A || '').trim(),
    tokenB: (process.env.LAMPY_FAMILY_ACCEPT_IDENTITY_TOKEN_B || '').trim(),
    testTokensSet: Boolean((process.env.LAMPY_FAMILY_API_TEST_TOKENS || '').trim()),
  };
}

function walkVerdicts(walked, target) {
  if (!walked.signedIn) {
    return {
      login: verdict('FAIL', `${target} Apple sign-in failed at ${walked.step}`),
      membership: verdict('FAIL', `${target} membership walk did not start`),
    };
  }
  if (!walked.ok) {
    return {
      login: verdict('PASS', `${target} Apple identity tokens accepted`),
      membership: verdict('FAIL', `${target} stopped at ${walked.step}`),
    };
  }
  return {
    login: verdict('PASS', `${target} Apple identity tokens accepted`),
    membership: verdict(
      'PASS',
      `${target} invite, join, creator-remove, and member-leave; accounts ${walked.alice} ${walked.bob}`,
    ),
  };
}

function missingTokenVerdicts(pair, target) {
  if (pair.kind === 'missing') {
    return {
      login: verdict('NOT VERIFIED', `no real Apple identity tokens for ${target}`),
      membership: verdict('NOT VERIFIED', `need two independent real Apple accounts on ${target}`),
    };
  }
  if (pair.kind === 'not-jwt') {
    return {
      login: verdict('FAIL', 'refused non-JWT / test-token substitute'),
      membership: verdict('FAIL', 'refused to walk membership with test tokens'),
    };
  }
  return {
    login: verdict('FAIL', 'LAMPY_FAMILY_API_TEST_TOKENS is set; will not treat this as real Apple'),
    membership: verdict('FAIL', 'test tokens present'),
  };
}

function evaluateHostedVolume() {
  const probePath = (process.env.LAMPY_FAMILY_ACCEPT_VOLUME_PROBE || '').trim();
  const hostedDb = (process.env.LAMPY_FAMILY_ACCEPT_HOSTED_DATABASE_PATH || '').trim();
  const hostedRoot = (process.env.LAMPY_FAMILY_ACCEPT_HOSTED_VOLUME_ROOT || '').trim();
  const afterRestart = process.env.LAMPY_FAMILY_ACCEPT_VOLUME_AFTER_RESTART === '1';

  if (probePath && fs.existsSync(probePath)) {
    try {
      return validateHostedVolumeProbe(loadVolumeProbeFile(probePath));
    } catch (error) {
      return verdict('FAIL', error instanceof Error ? error.message : 'volume-probe-unreadable');
    }
  }
  if (hostedDb && hostedRoot) {
    return validateHostedVolumeProbe(inspectHostedVolume({ databasePath: hostedDb, volumeRoot: hostedRoot, afterRestart }));
  }
  return verdict(
    'NOT VERIFIED',
    'no hosted volume probe. On the host: npm run family-identity:volume-probe, restart family-api, re-run with --after-restart, then set LAMPY_FAMILY_ACCEPT_VOLUME_PROBE to that JSON',
  );
}

async function walkIfPossible(target, baseUrl, pair, tokens) {
  if (pair.kind !== 'jwt') return missingTokenVerdicts(pair, target);
  const walked = await walkIdentityLoop(baseUrl, tokens.tokenA, tokens.tokenB, target);
  return walkVerdicts(walked, target);
}

async function main() {
  const requireAccepted = process.argv.includes('--require-accepted');
  const checks = {};
  const inventory = collectInventory();
  const harness = await runNpm(['run', 'family-identity:accept-test']);
  checks.accept_harness_contract = harness.code === 0
    ? verdict('PASS', 'local/deployed split and hosted-volume probe contract tests passed')
    : verdict('FAIL', 'family-identity accept contract tests failed');

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

  checks.hosted_persistent_volume = evaluateHostedVolume();
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

  const tokens = readTokens();
  const pair = tokenPairStatus(tokens.tokenA, tokens.tokenB, tokens.testTokensSet);
  let listening;

  try {
    listening = await startFamilyApi({
      LAMPY_FAMILY_API_MODE: 'production',
      LAMPY_FAMILY_DATABASE_PATH: databasePath,
      LAMPY_APPLE_CLIENT_ID: inventory.appleClientId,
      LAMPY_FAMILY_API_HOST: '127.0.0.1',
      LAMPY_FAMILY_API_PORT: '0',
    });
    const localUrl = `http://127.0.0.1:${listening.port}`;
    await expectHealth(localUrl);
    const unsigned = await require('./family-identity-walk.cjs').callFamily(localUrl, 'POST', '/v1/auth/apple', {
      body: { identityToken: 'not-a-jwt' },
    });
    checks.unsigned_token_rejected = unsigned.status === 401 && unsigned.errorCode === 'APPLE_TOKEN_INVALID'
      ? verdict('PASS', 'local non-JWT identity token rejected')
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
      ? verdict('PASS', `local sqlite still on volume after restart, migrations=${afterStopCount}`)
      : verdict('FAIL', 'sqlite missing or migrations changed across restart');

    await stopFamilyApi(listening);
    listening = undefined;
    const backupDir = path.join(volume, 'backup');
    const { copySqliteFiles, restoreSqliteFiles } = require('./family-identity-lib.cjs');
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
    const localBaseUrl = `http://127.0.0.1:${listening.port}`;
    await expectHealth(localBaseUrl);
    checks.backup_restore = restoredCount === migratedCount
      ? verdict('PASS', 'local stopped-process copy restored and listen accepted the file')
      : verdict('FAIL', 'restored sqlite missing migrations');

    const localWalk = await walkIfPossible('local-ephemeral', localBaseUrl, pair, tokens);
    checks.local_real_apple_login = localWalk.login;
    checks.local_invite_join_leave_and_remove = localWalk.membership;
  } catch (error) {
    checks.local_single_instance_listen = verdict('FAIL', error instanceof Error ? error.message : 'listen-failed');
    if (!checks.restart_reads_sqlite) checks.restart_reads_sqlite = verdict('FAIL', 'listen did not complete');
    if (!checks.backup_restore) checks.backup_restore = verdict('FAIL', 'listen did not complete');
    if (!checks.local_real_apple_login) {
      const skipped = missingTokenVerdicts(pair, 'local-ephemeral');
      checks.local_real_apple_login = pair.kind === 'jwt'
        ? verdict('NOT VERIFIED', 'local production listen failed before Apple tokens')
        : skipped.login;
      checks.local_invite_join_leave_and_remove = pair.kind === 'jwt'
        ? verdict('NOT VERIFIED', 'local production listen failed before membership walk')
        : skipped.membership;
    }
  } finally {
    await stopFamilyApi(listening);
  }

  if (!checks.local_single_instance_listen) {
    checks.local_single_instance_listen = checks.local_volume_migrate.status === 'PASS' && checks.restart_reads_sqlite?.status === 'PASS'
      ? verdict('PASS', 'single Node process on a local volume; not a hosted deployment')
      : verdict('FAIL', 'local single-instance production listen incomplete');
  }

  const authorizedUrl = (process.env.LAMPY_FAMILY_ACCEPT_PUBLIC_URL || '').trim();
  const deployed = isAuthorizedDeployedUrl(authorizedUrl, listening);
  if (!authorizedUrl) {
    checks.public_https_service = verdict('NOT VERIFIED', 'LAMPY_FAMILY_ACCEPT_PUBLIC_URL is unset; /health on an Expo URL is not a deployed identity walk');
    checks.deployed_real_apple_login = verdict(
      'NOT VERIFIED',
      'no authorized test service URL; local 127.0.0.1 Apple login is not this check',
    );
    checks.deployed_invite_join_leave_and_remove = verdict(
      'NOT VERIFIED',
      'no authorized test service URL; local 127.0.0.1 invite/join/leave/remove is not this check',
    );
  } else if (deployed.reason === 'public-http-refused') {
    checks.public_https_service = verdict('FAIL', 'public http URL is refused by the iOS client');
    checks.deployed_real_apple_login = verdict('FAIL', 'refused to send Apple tokens to public http');
    checks.deployed_invite_join_leave_and_remove = verdict('FAIL', 'refused to walk membership on public http');
  } else if (deployed.reason === 'ephemeral-local-listen') {
    checks.public_https_service = verdict('FAIL', 'authorized URL points at this script’s ephemeral 127.0.0.1 listen');
    checks.deployed_real_apple_login = verdict('FAIL', 'deployed login cannot use the temporary local process');
    checks.deployed_invite_join_leave_and_remove = verdict('FAIL', 'deployed membership cannot use the temporary local process');
  } else if (!deployed.ok) {
    checks.public_https_service = verdict('FAIL', `authorized URL is ${deployed.reason}`);
    checks.deployed_real_apple_login = verdict('NOT VERIFIED', 'authorized URL was not usable');
    checks.deployed_invite_join_leave_and_remove = verdict('NOT VERIFIED', 'authorized URL was not usable');
  } else {
    try {
      const slice = await expectHealth(deployed.href);
      checks.public_https_service = verdict('PASS', `authorized service health ok slice=${slice}`);
    } catch (error) {
      checks.public_https_service = verdict('FAIL', error instanceof Error ? error.message : 'deployed-health-failed');
    }
    if (checks.public_https_service.status === 'PASS') {
      const deployedWalk = await walkIfPossible('authorized-deployed-service', deployed.href, pair, tokens);
      checks.deployed_real_apple_login = deployedWalk.login;
      checks.deployed_invite_join_leave_and_remove = deployedWalk.membership;
    } else {
      checks.deployed_real_apple_login = verdict('NOT VERIFIED', 'authorized service /health failed; membership walk not attempted');
      checks.deployed_invite_join_leave_and_remove = verdict('NOT VERIFIED', 'authorized service /health failed; membership walk not attempted');
    }
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

  const localIdentityLoopPassed =
    checks.local_real_apple_login?.status === 'PASS' && checks.local_invite_join_leave_and_remove?.status === 'PASS';
  const deployedIdentityLoopPassed =
    checks.deployed_real_apple_login?.status === 'PASS' && checks.deployed_invite_join_leave_and_remove?.status === 'PASS';
  const identityLoopAccepted =
    deployedIdentityLoopPassed &&
    checks.hosted_persistent_volume?.status === 'PASS' &&
    checks.public_https_service?.status === 'PASS';
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
    localIdentityLoopPassed,
    deployedIdentityLoopPassed,
    identityLoopAccepted,
    automation: {
      exitZeroMeans: 'no FAIL checks; inventory/local harness succeeded',
      identityClosureField: 'identityLoopAccepted',
      reportFile: '.family-identity-accept.report.json',
      requireAcceptedFlag: '--require-accepted',
      requireAcceptedExitCode: 2,
    },
    conclusion: identityLoopAccepted
      ? 'deployed family identity loop accepted for this environment'
      : failed
        ? 'family identity loop not accepted; see FAIL checks'
        : 'family identity loop not accepted; deployed Apple / hosted volume still NOT VERIFIED',
    openToRealUsers: false,
  };

  const reportFile = path.join(IOS_ROOT, '.family-identity-accept.report.json');
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (failed) process.exitCode = 1;
  else if (requireAccepted && !identityLoopAccepted) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
