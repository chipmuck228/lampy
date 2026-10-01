#!/usr/bin/env node
/* global __dirname */
/**
 * Inspect a Release .xcarchive. Prints reason codes only (no secrets, no bundle snippets).
 * Exit 0 only when Bundle ID / version / build / Team / main.jsbundle match.
 * This is metadata + a few string probes, not "feature flags closed on device".
 * "jsbundle present" is not "runtime independent of Metro".
 */
'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_APP_JSON = path.join(__dirname, '..', 'app.json');

function expectedFromAppJson(appJsonPath = DEFAULT_APP_JSON) {
  const raw = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  const version = raw?.expo?.version;
  const build = raw?.expo?.ios?.buildNumber;
  if (version == null || version === '' || build == null || build === '') {
    throw new Error('app.json missing expo.version or expo.ios.buildNumber');
  }
  return {
    bundleId: 'app.lampy.ios',
    team: 'B283NY984J',
    version: String(version),
    build: String(build),
  };
}

function inspectJsBundleText(text) {
  const problems = [];
  if (!text || !text.trim()) problems.push('jsbundle_empty');
  if (text.includes('Searching for development servers')) problems.push('dev_launcher_copy');
  if (text.includes('family.example')) problems.push('family_example_host');
  return {
    problems,
    size: text.length,
    jsbundlePresent: text.length > 0,
    runtimeMetroIndependent: 'NOT_VERIFIED',
  };
}

function plistPrint(plist, key) {
  try {
    return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

function codesignTeam(app) {
  const result = spawnSync('codesign', ['-dv', '--verbose=4', app], { encoding: 'utf8' });
  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  const match = /TeamIdentifier=([A-Z0-9]+)/.exec(text);
  return match ? match[1] : '';
}

function listPrivacyManifests(app) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'PrivacyInfo.xcprivacy') found.push(path.relative(app, full));
    }
  };
  walk(app);
  return found.sort();
}

function inspectArchive(archivePath, expected = expectedFromAppJson()) {
  const problems = [];
  const archive = path.resolve(archivePath);
  const app = path.join(archive, 'Products/Applications/Lampy.app');
  const report = {
    archive,
    appExists: fs.existsSync(app),
    bundleId: '',
    version: '',
    build: '',
    team: '',
    jsbundlePath: '',
    jsbundlePresent: false,
    runtimeMetroIndependent: 'NOT_VERIFIED',
    privacyManifests: [],
    problems,
  };

  if (!fs.existsSync(archive)) {
    problems.push('archive_missing');
    return report;
  }
  if (!fs.existsSync(app)) {
    problems.push('app_missing');
    return report;
  }

  const info = path.join(app, 'Info.plist');
  report.bundleId = plistPrint(info, 'CFBundleIdentifier');
  report.version = plistPrint(info, 'CFBundleShortVersionString');
  report.build = plistPrint(info, 'CFBundleVersion');
  report.team = codesignTeam(app);

  if (report.bundleId !== expected.bundleId) problems.push('bundle_id_mismatch');
  if (report.version !== expected.version) problems.push('version_mismatch');
  if (report.build !== expected.build) problems.push('build_mismatch');
  if (report.team !== expected.team) problems.push('team_mismatch');

  const js = path.join(app, 'main.jsbundle');
  report.jsbundlePath = fs.existsSync(js) ? 'main.jsbundle' : '';
  if (!fs.existsSync(js)) {
    problems.push('jsbundle_missing');
  } else {
    const text = fs.readFileSync(js, 'utf8');
    const jsReport = inspectJsBundleText(text);
    report.jsbundlePresent = jsReport.jsbundlePresent;
    report.runtimeMetroIndependent = jsReport.runtimeMetroIndependent;
    report.jsbundleSize = jsReport.size;
    problems.push(...jsReport.problems);
  }

  report.privacyManifests = listPrivacyManifests(app);
  if (!report.privacyManifests.includes('PrivacyInfo.xcprivacy')) {
    problems.push('app_privacyinfo_missing');
  }

  return report;
}

function printReport(report) {
  const lines = [
    `archive=${report.archive}`,
    `bundle_id=${report.bundleId || 'MISSING'}`,
    `version=${report.version || 'MISSING'}`,
    `build=${report.build || 'MISSING'}`,
    `team=${report.team || 'MISSING'}`,
    `jsbundle_present=${report.jsbundlePresent ? 'yes' : 'no'}`,
    `inspect_scope=plist_codesign_jsbundle_few_strings`,
    `flags_release_pages=NOT_VERIFIED`,
    `runtime_metro_independent=${report.runtimeMetroIndependent}`,
    `privacy_manifest_count=${report.privacyManifests.length}`,
    `privacy_manifests=${report.privacyManifests.join(',') || 'NONE'}`,
    `problems=${report.problems.join(',') || 'none'}`,
  ];
  for (const line of lines) console.log(line);
}

module.exports = { expectedFromAppJson, inspectJsBundleText, inspectArchive };

if (require.main === module) {
  const archive = process.argv[2];
  if (!archive) {
    console.error('usage: inspect-release-archive.cjs /path/to/Lampy.xcarchive');
    process.exit(2);
  }
  const report = inspectArchive(archive);
  printReport(report);
  process.exit(report.problems.length === 0 ? 0 : 1);
}
