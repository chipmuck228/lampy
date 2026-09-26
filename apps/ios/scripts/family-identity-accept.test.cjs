'use strict';

const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  attachCreatedFamilyCleanup,
  createdFamilyCleanupResult,
  isAuthorizedDeployedUrl,
  requireAccountsHaveNoFamily,
  vacantMembership,
  walkIdentityLoop,
} = require('./family-identity-walk.cjs');
const { validateHostedVolumeProbe } = require('./family-identity-volume.cjs');

test('hosted volume stays NOT VERIFIED without a probe and cannot be stubbed as PASS', () => {
  assert.equal(validateHostedVolumeProbe(null).status, 'NOT VERIFIED');
  assert.equal(validateHostedVolumeProbe({ status: 'PASS' }).status, 'FAIL');
  assert.equal(
    validateHostedVolumeProbe({
      version: 1,
      path: { status: 'PASS' },
      migrations: { status: 'PASS' },
      backupRestore: { status: 'PASS' },
      restartRead: { status: 'NOT VERIFIED', detail: 'restart not observed' },
    }).status,
    'NOT VERIFIED',
  );
});

test('hosted volume PASS requires path, migrations, backup, and post-restart read', () => {
  assert.equal(
    validateHostedVolumeProbe({
      version: 1,
      path: { status: 'PASS' },
      migrations: { status: 'PASS' },
      backupRestore: { status: 'PASS' },
      restartRead: { status: 'PASS' },
    }).status,
    'PASS',
  );
  assert.equal(
    validateHostedVolumeProbe({
      version: 1,
      path: { status: 'FAIL', detail: 'tmpfs' },
      migrations: { status: 'PASS' },
      backupRestore: { status: 'PASS' },
      restartRead: { status: 'PASS' },
    }).status,
    'FAIL',
  );
});

test('deployed HTTPS refuses loopback and private HTTP, and private HTTPS', () => {
  const listening = { host: '127.0.0.1', port: 54321 };
  assert.equal(isAuthorizedDeployedUrl('', listening).ok, false);
  assert.equal(isAuthorizedDeployedUrl('http://127.0.0.1:54321', listening).reason, 'ephemeral-local-listen');
  assert.equal(isAuthorizedDeployedUrl('http://127.0.0.1:80', listening).reason, 'loopback-http-refused');
  assert.equal(isAuthorizedDeployedUrl('http://192.168.1.9:8787', listening).reason, 'private-http-refused');
  assert.equal(isAuthorizedDeployedUrl('http://10.0.0.8:8787', listening).reason, 'private-http-refused');
  assert.equal(isAuthorizedDeployedUrl('https://127.0.0.1', listening).reason, 'loopback-refused');
  assert.equal(isAuthorizedDeployedUrl('https://10.0.0.8', listening).reason, 'private-network-refused');
  assert.equal(isAuthorizedDeployedUrl('http://example.com', listening).reason, 'public-http-refused');
  assert.equal(isAuthorizedDeployedUrl('https://family.example.invalid', listening).ok, true);
});

test('existing families are reported and never left or dissolved', async () => {
  const methods = [];
  const server = http.createServer((req, res) => {
    methods.push(`${req.method} ${req.url}`);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ family: { familyId: 'fam_existing', role: 'creator', members: [{ userId: 'usr_a', role: 'creator' }] } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const result = await requireAccountsHaveNoFamily(`http://127.0.0.1:${port}`, {
      sessionToken: 'ses_a',
      userId: 'usr_a',
    }, {
      sessionToken: 'ses_b',
      userId: 'usr_b',
    });
    assert.equal(result.ok, false);
    assert.equal(result.step, 'account-already-in-family-a');
    assert.deepEqual(methods, ['GET /v1/me/membership']);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('membership must be 200 with family null before creating a family', () => {
  assert.equal(vacantMembership({ status: 200, raw: { family: null } }).ok, true);
  assert.equal(vacantMembership({ status: 401, raw: { error: { code: 'UNAUTHENTICATED' } } }).reason, 'unauthenticated');
  assert.equal(vacantMembership({ status: 500, raw: { error: { code: 'INTERNAL' } } }).reason, 'server-error');
  assert.equal(vacantMembership({ status: 200, raw: {} }).reason, 'unexpected-membership');
  assert.equal(vacantMembership({ status: 200, raw: { family: undefined } }).reason, 'unexpected-membership');
});

test('401 or 500 membership stops before creating or querying the other account', async () => {
  for (const status of [401, 500]) {
    const methods = [];
    const server = http.createServer((req, res) => {
      methods.push(`${req.method} ${req.url}`);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL' } }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const result = await requireAccountsHaveNoFamily(`http://127.0.0.1:${port}`, {
        sessionToken: 'ses_a',
        userId: 'usr_a',
      }, {
        sessionToken: 'ses_b',
        userId: 'usr_b',
      });
      assert.equal(result.ok, false);
      assert.match(result.step, status === 401 ? /membership-a-unauthenticated/ : /membership-a-server-error/);
      assert.deepEqual(methods, ['GET /v1/me/membership']);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

test('both vacant memberships are required before create', async () => {
  const methods = [];
  const server = http.createServer((req, res) => {
    methods.push(`${req.method} ${req.url}`);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ family: null }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const result = await requireAccountsHaveNoFamily(`http://127.0.0.1:${port}`, {
      sessionToken: 'ses_a',
      userId: 'usr_a',
    }, {
      sessionToken: 'ses_b',
      userId: 'usr_b',
    });
    assert.equal(result.ok, true);
    assert.deepEqual(methods, ['GET /v1/me/membership', 'GET /v1/me/membership']);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('failed cleanup of this run’s family is not a successful walk', () => {
  const failed = createdFamilyCleanupResult({ status: 500, raw: { error: { code: 'INTERNAL' } } }, 'fam_accept');
  assert.equal(failed.ok, false);
  assert.equal(failed.step, 'created-family-cleanup-failed');
  assert.equal(failed.needsManualCleanup, true);
  assert.equal(failed.createdFamilyCleanup, 'left-in-place');
  assert.match(failed.leftoverFamily, /^sha256:/);

  const missing = createdFamilyCleanupResult({ status: 200, raw: {} }, 'fam_accept');
  assert.equal(missing.ok, false);
  assert.equal(missing.needsManualCleanup, true);

  const ok = createdFamilyCleanupResult({ status: 200, raw: { dissolved: true } }, 'fam_accept');
  assert.equal(ok.ok, true);

  const leftover = attachCreatedFamilyCleanup(
    { ok: false, step: 'invite-1', signedIn: true },
    createdFamilyCleanupResult({ status: 500, raw: {} }, 'fam_accept'),
    'fam_accept',
  );
  assert.equal(leftover.ok, false);
  assert.equal(leftover.step, 'invite-1');
  assert.equal(leftover.needsManualCleanup, true);
  assert.match(leftover.leftoverFamily, /^sha256:/);
});

test('first invite failure still dissolves the family created in this run', async () => {
  const methods = [];
  let apple = 0;
  const server = http.createServer((req, res) => {
    methods.push(`${req.method} ${req.url}`);
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'POST' && req.url === '/v1/auth/apple') {
      apple += 1;
      send(200, {
        userId: apple === 1 ? 'usr_a' : 'usr_b',
        sessionToken: apple === 1 ? 'ses_a' : 'ses_b',
        expiresAt: '2099-01-01T00:00:00.000Z',
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/v1/me/membership') {
      send(200, { family: null });
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/families') {
      send(200, { familyId: 'fam_accept' });
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/families/fam_accept/invitations') {
      send(500, { error: { code: 'INTERNAL' } });
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/families/fam_accept/dissolve') {
      send(500, { error: { code: 'INTERNAL' } });
      return;
    }
    send(404, { error: { code: 'BAD_REQUEST' } });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const result = await walkIdentityLoop(`http://127.0.0.1:${port}`, 'token-a', 'token-b', 'test');
    assert.equal(result.ok, false);
    assert.equal(result.step, 'invite-1');
    assert.equal(result.needsManualCleanup, true);
    assert.match(result.leftoverFamily, /^sha256:/);
    assert.ok(methods.includes('POST /v1/families/fam_accept/invitations'));
    assert.ok(methods.includes('POST /v1/families/fam_accept/dissolve'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('inventory reports media path presence without values', () => {
  const { collectInventory } = require('./family-identity-lib.cjs');
  const previous = process.env.LAMPY_FAMILY_MEDIA_PATH;
  const fakePath = '/tmp/lampy-fake-family-media-not-a-real-volume';
  try {
    process.env.LAMPY_FAMILY_MEDIA_PATH = fakePath;
    const whenSet = collectInventory();
    assert.equal(whenSet.env.LAMPY_FAMILY_MEDIA_PATH, 'SET');
    assert.equal(JSON.stringify(whenSet).includes(fakePath), false);
    delete process.env.LAMPY_FAMILY_MEDIA_PATH;
    const whenUnset = collectInventory();
    assert.equal(whenUnset.env.LAMPY_FAMILY_MEDIA_PATH, 'UNSET');
  } finally {
    if (previous === undefined) delete process.env.LAMPY_FAMILY_MEDIA_PATH;
    else process.env.LAMPY_FAMILY_MEDIA_PATH = previous;
  }
});
