'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { expectedFromAppJson, inspectJsBundleText } = require('./inspect-release-archive.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');

test('string probes do not claim feature flags or Metro independence', () => {
  const report = inspectJsBundleText('function start(){return "0"}');
  assert.deepEqual(report.problems, []);
  assert.equal(report.jsbundlePresent, true);
  assert.equal(report.runtimeMetroIndependent, 'NOT_VERIFIED');
});

test('version and build expectations come from app.json, not a hardcoded 0.1.0 / 1', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lampy-app-json-'));
  const file = path.join(dir, 'app.json');
  fs.writeFileSync(
    file,
    JSON.stringify({ expo: { version: '0.2.0', ios: { buildNumber: '7' } } }),
  );
  const expected = expectedFromAppJson(file);
  assert.equal(expected.version, '0.2.0');
  assert.equal(expected.build, '7');
  assert.notEqual(expected.build, '1');
});

test('missing or empty bundle is a hard failure', () => {
  assert.deepEqual(inspectJsBundleText('').problems, ['jsbundle_empty']);
});

test('dev launcher copy and example family host fail string probes', () => {
  const report = inspectJsBundleText(
    'Searching for development servers at http://localhost\nhttps://family.example.com',
  );
  assert.ok(report.problems.includes('dev_launcher_copy'));
  assert.ok(report.problems.includes('family_example_host'));
});
