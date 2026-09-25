'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { inspectHostedVolume, validateHostedVolumeProbe } = require('./family-identity-volume.cjs');

function seedDatabase(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec(`CREATE TABLE family_schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL);`);
  db.prepare('INSERT INTO family_schema_migrations (version, applied_at) VALUES (?, ?)').run(1, new Date().toISOString());
  db.close();
}

test('hosted volume probe can PASS after a restart observation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lampy-volume-probe-'));
  const databasePath = path.join(root, 'family.db');
  seedDatabase(databasePath);

  const first = inspectHostedVolume({ databasePath, volumeRoot: root, afterRestart: false });
  assert.equal(first.path.status, 'PASS');
  assert.equal(first.migrations.status, 'PASS');
  assert.equal(first.backupRestore.status, 'PASS');
  assert.equal(first.restartRead.status, 'NOT VERIFIED');
  assert.equal(validateHostedVolumeProbe(first).status, 'NOT VERIFIED');

  const second = inspectHostedVolume({ databasePath, volumeRoot: root, afterRestart: true });
  assert.equal(second.restartRead.status, 'PASS');
  assert.equal(validateHostedVolumeProbe(second).status, 'PASS');
});

test('hosted volume probe FAILs when the database is outside the volume root', () => {
  const volumeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lampy-volume-root-'));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'lampy-volume-other-'));
  const databasePath = path.join(other, 'family.db');
  seedDatabase(databasePath);
  const report = inspectHostedVolume({ databasePath, volumeRoot, afterRestart: false });
  assert.equal(report.path.status, 'FAIL');
  assert.equal(validateHostedVolumeProbe(report).status, 'FAIL');
});
