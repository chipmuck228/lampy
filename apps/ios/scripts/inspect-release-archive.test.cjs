'use strict';

const { inspectJsBundleText } = require('./inspect-release-archive.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');

test('closed bundle text has no fail codes and stays install-unverified', () => {
  const report = inspectJsBundleText('function start(){return "0"}');
  assert.deepEqual(report.problems, []);
  assert.equal(report.jsbundlePresent, true);
  assert.equal(report.runtimeMetroIndependent, 'NOT_VERIFIED');
});

test('missing or empty bundle is a hard failure', () => {
  assert.deepEqual(inspectJsBundleText('').problems, ['jsbundle_empty']);
});

test('dev launcher copy and example family host fail closed-bundle checks', () => {
  const report = inspectJsBundleText(
    'Searching for development servers at http://localhost\nhttps://family.example.com',
  );
  assert.ok(report.problems.includes('dev_launcher_copy'));
  assert.ok(report.problems.includes('family_example_host'));
});
