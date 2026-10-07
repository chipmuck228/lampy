/* global __dirname */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function apply(root = path.resolve(__dirname, '..')) {
  const repo = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
  const cwd = repo.status === 0 ? repo.stdout.trim() : root;
  const prefix = path.relative(cwd, root);
  const directory = prefix ? [`--directory=${prefix}`] : [];
  for (const [name, version] of [['expo-modules-jsi', '57.1.0'], ['expo-modules-core', '57.0.18']]) {
    const installed = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
    if (installed !== version) throw new Error(`${name}: expected ${version}, found ${installed}; review compatibility patch before upgrading`);
    const patch = path.join(root, 'patches', `${name}+${version}.patch`);
    const run = args => spawnSync('git', ['apply', ...directory, ...args, patch], { cwd, encoding: 'utf8' });
    if (run(['--reverse', '--check']).status === 0) { console.log(`${name}: already patched`); continue; }
    const check = run(['--check']);
    if (check.status !== 0) throw new Error(`${name}: patch check failed\n${check.stderr || check.error || ''}`);
    const result = run([]);
    if (result.status !== 0) throw new Error(`${name}: patch application failed\n${result.stderr || result.error || ''}`);
    console.log(`${name}: patched`);
  }
}
module.exports = { apply };
if (require.main === module) { try { apply(); } catch (error) { console.error(error.message); process.exit(1); } }
