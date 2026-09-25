'use strict';

const { collectInventory, fetchAppleJwksMeta } = require('./family-identity-lib.cjs');

async function main() {
  const inventory = collectInventory();
  let appleJwks = { status: 0, keyCount: 0, error: 'not-fetched' };
  try {
    appleJwks = await fetchAppleJwksMeta();
  } catch (error) {
    appleJwks = { status: 0, keyCount: 0, error: error instanceof Error ? error.message : 'jwks-failed' };
  }

  const report = {
    kind: 'family-identity-inventory',
    secretsPrinted: false,
    app: inventory.app,
    entitlements: inventory.entitlements,
    audience: {
      bundleIdentifier: inventory.app.bundleIdentifier,
      appleClientSource: inventory.appleClientSource,
      matchesBundle: inventory.audienceMatchesBundle,
    },
    envPresence: inventory.env,
    publicUrlKind: inventory.publicUrl.kind,
    deployFiles: inventory.deployFiles,
    appleJwks: { status: appleJwks.status, keyCount: appleJwks.keyCount, error: appleJwks.error },
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
