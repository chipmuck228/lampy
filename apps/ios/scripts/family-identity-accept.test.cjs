'use strict';

const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');
const { isAuthorizedDeployedUrl, requireAccountsHaveNoFamily } = require('./family-identity-walk.cjs');
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
    assert.deepEqual(methods, ['GET /v1/me/membership', 'GET /v1/me/membership']);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
