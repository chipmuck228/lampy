'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { inspectHostedVolume } = require('./family-identity-volume.cjs');

function main() {
  const databasePath = (process.env.LAMPY_FAMILY_ACCEPT_HOSTED_DATABASE_PATH || process.env.LAMPY_FAMILY_DATABASE_PATH || '').trim();
  const volumeRoot = (process.env.LAMPY_FAMILY_ACCEPT_HOSTED_VOLUME_ROOT || '').trim();
  if (!databasePath || !volumeRoot) {
    process.stderr.write(
      'Set LAMPY_FAMILY_ACCEPT_HOSTED_DATABASE_PATH (or LAMPY_FAMILY_DATABASE_PATH) and LAMPY_FAMILY_ACCEPT_HOSTED_VOLUME_ROOT.\n',
    );
    process.exit(1);
    return;
  }
  const afterRestart =
    process.argv.includes('--after-restart') || process.env.LAMPY_FAMILY_ACCEPT_VOLUME_AFTER_RESTART === '1';
  const report = inspectHostedVolume({ databasePath, volumeRoot, afterRestart });
  const out = (process.env.LAMPY_FAMILY_ACCEPT_VOLUME_PROBE || '').trim();
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main();
