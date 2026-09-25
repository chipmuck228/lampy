'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isAuthorizedDeployedUrl } = require('./family-identity-walk.cjs');
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

test('the ephemeral 127.0.0.1 listen is not an authorized deployed service', () => {
  const listening = { host: '127.0.0.1', port: 54321 };
  assert.equal(isAuthorizedDeployedUrl('', listening).ok, false);
  assert.equal(isAuthorizedDeployedUrl('http://127.0.0.1:54321', listening).reason, 'ephemeral-local-listen');
  assert.equal(isAuthorizedDeployedUrl('http://example.com', listening).reason, 'public-http-refused');
  assert.equal(isAuthorizedDeployedUrl('https://family.example.invalid', listening).ok, true);
});
