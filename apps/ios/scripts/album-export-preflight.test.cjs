/* global __dirname */
'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {inspect} = require('./album-export-preflight.cjs');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
function fixture() {
  return {mode: 'local', env: {EXPO_PUBLIC_ALBUM_EXPORT_ENABLED: '1', EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED: '1', EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID: 'app.lampy.export.test'}, native: {enabled: true, productId: 'app.lampy.export.test'}, scheme: '<LaunchAction><StoreKitConfigurationFileReference identifier="../LampyLocal.storekit"></StoreKitConfigurationFileReference></LaunchAction>', storekit: {file: 'ios/LampyLocal.storekit', data: {products: [{productID: 'app.lampy.export.test', type: 'NonConsumable', displayPrice: '6.00', localizations: [{displayName: 'Export', description: 'PDF export'}]}]}}};
}
test('accepts consistent local configuration without claiming runtime readiness', () => assert.deepEqual(inspect(fixture()), []));
test('detects JS/native drift and disabled native purchase configuration', () => {
  const f = fixture(); f.native = {enabled: false, productId: 'old'};
  assert.deepEqual(inspect(f), ['NATIVE_PAID_DISABLED', 'NATIVE_PRODUCT_MISMATCH']);
});
test('detects a unified flag enabled only in Metro without native rebuild', () => {
  const f=fixture();f.env.EXPO_PUBLIC_UNIFIED_PURCHASES='1';
  assert.deepEqual(inspect(f),['NATIVE_UNIFIED_MISMATCH']);
  f.native.unified=true;assert.deepEqual(inspect(f),[]);
});
test('sandbox rejects a selected local StoreKit configuration and the known local SKU', () => {
  const f = fixture(); f.mode = 'sandbox';
  assert.deepEqual(inspect(f), ['SANDBOX_REQUIRES_STOREKIT_NONE', 'SANDBOX_REQUIRES_REAL_PRODUCT']);
  f.scheme = '<LaunchAction></LaunchAction>'; f.env.EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID = f.native.productId = 'app.lampy.configured.export';
  assert.deepEqual(inspect(f), []);
});
test('missing local product or wrong product type blocks the test', () => {
  const f = fixture(); f.storekit.data.products[0].type = 'Consumable';
  assert.deepEqual(inspect(f), ['LOCAL_PRODUCT_MISSING_OR_WRONG_TYPE']);
});
test('requires the Run action, matching selected filename and valid flags', () => {
  const f = fixture(); f.scheme = '<TestAction><StoreKitConfigurationFileReference identifier="test.storekit"/></TestAction>';
  assert.ok(inspect(f).includes('LAUNCH_ACTION_MISSING'));
  f.scheme = '<LaunchAction><StoreKitConfigurationFileReference identifier="other.storekit"/></LaunchAction>';
  assert.ok(inspect(f).includes('STOREKIT_SELECTION_MISMATCH'));
  f.env.EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED = 'yes'; assert.deepEqual(inspect(f), ['INVALID_EXPORT_CONFIG']);
});
test('CLI fails before native reads for an omitted or invalid mode', () => {
  for (const args of [[], ['--mode', 'production'], ['--unknown', 'x']]) {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'album-export-preflight.cjs'), ...args], {encoding: 'utf8'});
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stderr);
    assert.equal(report.configuration, 'BLOCKED');
    assert.equal(report.releaseReady, 'NOT_VERIFIED');
  }
});
