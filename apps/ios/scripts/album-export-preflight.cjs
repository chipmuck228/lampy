#!/usr/bin/env node
/* global __dirname */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {configureAlbumExport} = require('./album-export-profile.cjs');

// Configuration consistency only. Never buys, syncs, grants access, or certifies release readiness.
function inspect({mode, env, native, scheme, storekit}) {
  const problems = [];
  if (!['local', 'sandbox'].includes(mode)) return ['MODE_REQUIRED'];
  let expected;
  try { expected = configureAlbumExport({}, env).ios.infoPlist; }
  catch { return ['INVALID_EXPORT_CONFIG']; }
  if (!expected.LampyPaidExportEnabled) problems.push('PAID_TEST_FLAGS_REQUIRED');
  if (Boolean(native.unified) !== (env.EXPO_PUBLIC_UNIFIED_PURCHASES === '1')) problems.push('NATIVE_UNIFIED_MISMATCH');
  if (native.enabled !== true) problems.push('NATIVE_PAID_DISABLED');
  if (!expected.LampyExportProductID || native.productId !== expected.LampyExportProductID) problems.push('NATIVE_PRODUCT_MISMATCH');
  const launch = /<LaunchAction\b[\s\S]*?<\/LaunchAction>/.exec(scheme)?.[0];
  if (!launch) problems.push('LAUNCH_ACTION_MISSING');
  const selected = /<StoreKitConfigurationFileReference\b[^>]*\bidentifier\s*=\s*"([^"]+)"/.exec(launch || '')?.[1];
  if (mode === 'local') {
    if (!selected) problems.push('LOCAL_STOREKIT_NOT_SELECTED');
    if (!storekit) problems.push('LOCAL_STOREKIT_FILE_REQUIRED');
    else {
      // Explicit file selection avoids assuming Xcode's relative reference resolution.
      if (selected && path.basename(selected) !== path.basename(storekit.file)) problems.push('STOREKIT_SELECTION_MISMATCH');
      const product = storekit.data.products?.find(p => p.productID === expected.LampyExportProductID);
      if (!product || product.type !== 'NonConsumable') problems.push('LOCAL_PRODUCT_MISSING_OR_WRONG_TYPE');
      if (product && (!product.displayPrice || !product.localizations?.some(l => l.displayName && l.description))) problems.push('LOCAL_PRODUCT_METADATA_MISSING');
    }
  } else {
    if (selected) problems.push('SANDBOX_REQUIRES_STOREKIT_NONE');
    if (expected.LampyExportProductID === 'app.lampy.export.test') problems.push('SANDBOX_REQUIRES_REAL_PRODUCT');
  }
  return problems;
}

function main(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--mode', '--plist', '--scheme', '--storekit'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error('INVALID_ARGUMENTS');
    options[args[i].slice(2)] = args[i + 1];
  }
  if (!['local', 'sandbox'].includes(options.mode)) throw Error('MODE_REQUIRED');
  const root = path.resolve(__dirname, '..');
  const plist = path.resolve(root, options.plist || 'ios/Lampy/Info.plist');
  const schemeFile = path.resolve(root, options.scheme || 'ios/Lampy.xcodeproj/xcshareddata/xcschemes/Lampy.xcscheme');
  const read = key => execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  let native;
  let unified=false;
  try {unified=read('LampyUnifiedPurchasesEnabled')==='true';} catch { /* Older F1 builds default to off. */ }
  try { native = {unified,enabled: read('LampyPaidExportEnabled') === 'true', productId: read('LampyExportProductID')}; }
  catch { throw Error('NATIVE_PLIST_UNREADABLE_OR_NOT_GENERATED'); }
  const scheme = fs.readFileSync(schemeFile, 'utf8');
  const storekit = options.storekit ? {file: options.storekit, data: JSON.parse(fs.readFileSync(path.resolve(root, options.storekit), 'utf8'))} : null;
  const problems = inspect({mode: options.mode, env: process.env, native, scheme, storekit});
  console.log(JSON.stringify({configuration: problems.length ? 'BLOCKED' : 'CONSISTENT', mode: options.mode, problems, storekitRuntime: 'NOT_VERIFIED', appleSandbox: 'NOT_VERIFIED', releaseReady: 'NOT_VERIFIED'}));
  process.exitCode = problems.length ? 1 : 0;
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    const known = ['INVALID_ARGUMENTS', 'MODE_REQUIRED', 'NATIVE_PLIST_UNREADABLE_OR_NOT_GENERATED'];
    console.error(JSON.stringify({configuration: 'BLOCKED', problems: [known.includes(error.message) ? error.message : 'PREFLIGHT_INPUT_UNREADABLE'], releaseReady: 'NOT_VERIFIED'}));
    process.exitCode = 1;
  }
}
module.exports = {inspect};
