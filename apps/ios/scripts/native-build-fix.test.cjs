/* global __dirname, Buffer */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { apply } = require('./apply-native-patches.cjs');
const { configurePodfile } = require('../plugins/with-native-build-compat.cjs');
const { inspectDynamicLibraries } = require('./inspect-release-archive.cjs');
const root = path.resolve(__dirname, '..');
function temp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'lampy-build-test-')); }
test('Podfile configuration overrides an enabled value and is idempotent', () => {
  const value = configurePodfile("ENV['EXPO_USE_PRECOMPILED_MODULES'] = '1'\nrequire 'expo'\n");
  assert.equal(value, configurePodfile(value));
  assert.ok(value.startsWith("ENV['EXPO_USE_PRECOMPILED_MODULES'] = '0'\n"));
});
test('real installed source accepts both patches, second run is idempotent and version drift fails', () => {
  const dir = temp();
  try {
    fs.cpSync(path.join(root, 'patches'), path.join(dir, 'patches'), { recursive: true });
    for (const name of ['expo-modules-core', 'expo-modules-jsi']) fs.cpSync(path.join(root, 'node_modules', name), path.join(dir, 'node_modules', name), { recursive: true });
    // Reset patched inputs to pristine so this test always proves forward application.
    const { spawnSync } = require('node:child_process');
    for (const name of ['expo-modules-jsi+57.1.0.patch', 'expo-modules-core+57.0.18.patch']) spawnSync('git', ['apply', '--reverse', path.join(dir, 'patches', name)], { cwd: dir });
    apply(dir); apply(dir);
    assert.ok(fs.readFileSync(path.join(dir, 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/JavaScriptRuntime.swift'), 'utf8').includes('private struct JSIHostCallSlots'));
    const core = path.join(dir, 'node_modules/expo-modules-core');
    assert.ok(fs.readFileSync(path.join(core, 'ios/Core/Events/EventEmitter.swift'), 'utf8').includes('let emitter = NonisolatedUnsafeWeakVar(self)'));
    const emitterFile = path.join(core, 'ios/Core/Events/EventEmitter.swift');
    const repaired = fs.readFileSync(emitterFile, 'utf8');
    fs.writeFileSync(emitterFile, repaired.replaceAll('let emitter = NonisolatedUnsafeWeakVar(self)', 'let emitter = incompatibleEmitter(self)'));
    assert.throws(() => apply(dir), /patch check failed/);
    fs.writeFileSync(emitterFile, repaired);
    const file = path.join(core, 'package.json'); const pkg = JSON.parse(fs.readFileSync(file)); pkg.version = '999.0.0'; fs.writeFileSync(file, JSON.stringify(pkg));
    assert.throws(() => apply(dir), /expected 57.0.18/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('Build 4 missing React dependency fails; embedded framework passes; otool failure fails', () => {
  const app = temp();
  const magic = Buffer.from('cffaedfe', 'hex');
  fs.writeFileSync(path.join(app, 'Lampy'), magic);
  const dep = () => 'Lampy:\n\t@rpath/React.framework/React (compatibility version 0.0.0, current version 0.0.0)\n\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0)';
  try {
    assert.ok(inspectDynamicLibraries(app, dep).problems[0].startsWith('missing_dependency:'));
    fs.mkdirSync(path.join(app, 'Frameworks/React.framework'), { recursive: true });
    fs.writeFileSync(path.join(app, 'Frameworks/React.framework/React'), magic);
    assert.deepEqual(inspectDynamicLibraries(app, dep).problems, []);
    assert.ok(inspectDynamicLibraries(app, () => { throw Error(); }).problems.every(p => p.startsWith('otool_failed:')));
  } finally { fs.rmSync(app, { recursive: true, force: true }); }
});
