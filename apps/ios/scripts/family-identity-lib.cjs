'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const IOS_ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(IOS_ROOT, '../..');
const APP_JSON = path.join(IOS_ROOT, 'app.json');
const ENTITLEMENTS = path.join(IOS_ROOT, 'ios/Lampy/Lampy.entitlements');

const SECRET_ENV_KEYS = [
  'LAMPY_FAMILY_API_TEST_TOKENS',
  'LAMPY_FAMILY_ACCEPT_IDENTITY_TOKEN_A',
  'LAMPY_FAMILY_ACCEPT_IDENTITY_TOKEN_B',
];

function envPresence(name) {
  const raw = process.env[name];
  return raw != null && String(raw).trim() !== '' ? 'SET' : 'UNSET';
}

function evidenceRef(value) {
  if (!value) return 'none';
  return `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12)}`;
}

function looksLikeJwt(value) {
  const parts = String(value || '').split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

function readAppConfig() {
  const expo = JSON.parse(fs.readFileSync(APP_JSON, 'utf8')).expo || {};
  return {
    bundleIdentifier: expo.ios?.bundleIdentifier || '',
    usesAppleSignIn: Boolean(expo.ios?.usesAppleSignIn),
    hasApplePlugin: Array.isArray(expo.plugins) && expo.plugins.includes('expo-apple-authentication'),
  };
}

function readEntitlementsCapability() {
  if (!fs.existsSync(ENTITLEMENTS)) {
    return { present: false, hasAppleSignIn: false };
  }
  const text = fs.readFileSync(ENTITLEMENTS, 'utf8');
  return {
    present: true,
    hasAppleSignIn: text.includes('com.apple.developer.applesignin'),
  };
}

function isLocalOrPrivateHostname(hostname) {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
  const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(hostname);
  if (!ipv4) return false;
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function classifyPublicUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return { kind: 'unset' };
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { kind: 'invalid' };
  }
  const local = isLocalOrPrivateHostname(parsed.hostname);
  if (parsed.protocol === 'https:') return { kind: local ? 'local-https' : 'public-https', hostnameKind: local ? 'private' : 'public' };
  if (parsed.protocol === 'http:' && local) return { kind: 'local-http' };
  if (parsed.protocol === 'http:') return { kind: 'public-http-refused' };
  return { kind: 'invalid' };
}

function requestJson(urlString, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      {
        method: options.method || 'GET',
        headers: {
          accept: 'application/json',
          ...(options.body ? { 'content-type': 'application/json' } : {}),
          ...(options.headers || {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let body = undefined;
          if (text) {
            try {
              body = JSON.parse(text);
            } catch {
              body = { parseError: true };
            }
          }
          resolve({ status: res.statusCode || 0, body });
        });
      },
    );
    req.setTimeout(options.timeoutMs || 8000, () => {
      req.destroy(new Error('request-timeout'));
    });
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

async function fetchAppleJwksMeta() {
  const response = await requestJson('https://appleid.apple.com/auth/keys', { timeoutMs: 8000 });
  const keys = Array.isArray(response.body?.keys) ? response.body.keys : [];
  return { status: response.status, keyCount: keys.length };
}

function sqliteTableNames(databasePath) {
  const db = new DatabaseSync(databasePath);
  try {
    const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all();
    return rows.map((row) => row.name);
  } finally {
    db.close();
  }
}

function sqliteMigrationCount(databasePath) {
  const db = new DatabaseSync(databasePath);
  try {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM family_schema_migrations`).get();
    return Number(row?.n || 0);
  } finally {
    db.close();
  }
}

function copySqliteFiles(fromPath, toDir) {
  fs.mkdirSync(toDir, { recursive: true });
  const base = path.basename(fromPath);
  for (const suffix of ['', '-wal', '-shm']) {
    const source = `${fromPath}${suffix}`;
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(toDir, `${base}${suffix}`));
  }
}

function restoreSqliteFiles(backupDir, toPath) {
  const base = path.basename(toPath);
  fs.mkdirSync(path.dirname(toPath), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    const source = path.join(backupDir, `${base}${suffix}`);
    const dest = `${toPath}${suffix}`;
    if (fs.existsSync(source)) fs.copyFileSync(source, dest);
    else if (fs.existsSync(dest)) fs.rmSync(dest);
  }
}

function startFamilyApi(env) {
  return new Promise((resolve, reject) => {
    const childEnv = { ...process.env, ...env };
    if (!Object.prototype.hasOwnProperty.call(env, 'LAMPY_FAMILY_API_TEST_TOKENS')) {
      delete childEnv.LAMPY_FAMILY_API_TEST_TOKENS;
    }
    const child = spawn(process.execPath, [path.join(__dirname, 'family-api.cjs')], {
      cwd: IOS_ROOT,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value);
    };
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      const match = /http:\/\/([^\s:]+):(\d+)/.exec(stdout);
      if (match) {
        finish(null, {
          child,
          host: match[1],
          port: Number(match[2]),
          banner: stdout.trim().split('\n')[0] || '',
        });
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => finish(error));
    child.on('exit', (code) => {
      finish(new Error(`family-api exited ${code}: ${(stderr || stdout).trim().split('\n').pop() || 'no output'}`));
    });
    setTimeout(() => finish(new Error('family-api start timeout')), 15000);
  });
}

async function stopFamilyApi(listening) {
  if (!listening?.child) return;
  await new Promise((resolve) => {
    listening.child.once('exit', resolve);
    listening.child.kill('SIGTERM');
    setTimeout(() => {
      if (!listening.child.killed) listening.child.kill('SIGKILL');
    }, 2000);
  });
}

async function runNpm(args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', args, {
      cwd: IOS_ROOT,
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function collectInventory() {
  const app = readAppConfig();
  const entitlements = readEntitlementsCapability();
  const appleClientId = (process.env.LAMPY_APPLE_CLIENT_ID || '').trim() || app.bundleIdentifier;
  const appleClientSource = envPresence('LAMPY_APPLE_CLIENT_ID') === 'SET' ? 'env' : 'app.json';
  const publicUrl = process.env.LAMPY_FAMILY_ACCEPT_PUBLIC_URL || process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL || '';
  return {
    repoRoot: REPO_ROOT,
    iosRoot: IOS_ROOT,
    app,
    entitlements,
    appleClientId,
    appleClientSource,
    audienceMatchesBundle: appleClientId === app.bundleIdentifier,
    env: {
      LAMPY_FAMILY_API_MODE: envPresence('LAMPY_FAMILY_API_MODE'),
      LAMPY_FAMILY_DATABASE_PATH: envPresence('LAMPY_FAMILY_DATABASE_PATH'),
      LAMPY_APPLE_CLIENT_ID: envPresence('LAMPY_APPLE_CLIENT_ID'),
      LAMPY_FAMILY_API_TEST_TOKENS: envPresence('LAMPY_FAMILY_API_TEST_TOKENS'),
      EXPO_PUBLIC_FAMILY_API_BASE_URL: envPresence('EXPO_PUBLIC_FAMILY_API_BASE_URL'),
      LAMPY_FAMILY_ACCEPT_VOLUME: envPresence('LAMPY_FAMILY_ACCEPT_VOLUME'),
      LAMPY_FAMILY_ACCEPT_PUBLIC_URL: envPresence('LAMPY_FAMILY_ACCEPT_PUBLIC_URL'),
      LAMPY_FAMILY_ACCEPT_IDENTITY_TOKEN_A: envPresence('LAMPY_FAMILY_ACCEPT_IDENTITY_TOKEN_A'),
      LAMPY_FAMILY_ACCEPT_IDENTITY_TOKEN_B: envPresence('LAMPY_FAMILY_ACCEPT_IDENTITY_TOKEN_B'),
    },
    publicUrl: classifyPublicUrl(publicUrl),
    deployFiles: {
      envExample: fs.existsSync(path.join(IOS_ROOT, 'src/family-api/deploy/env.example')),
      unit: fs.existsSync(path.join(IOS_ROOT, 'src/family-api/deploy/family-api.service')),
      caddy: fs.existsSync(path.join(IOS_ROOT, 'src/family-api/deploy/Caddyfile')),
    },
  };
}

function redactUnknown(value) {
  if (value == null) return value;
  if (typeof value === 'string') return evidenceRef(value);
  if (Array.isArray(value)) return value.map(redactUnknown);
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const lower = key.toLowerCase();
      if (
        /token|code|email|authorization|secret|password|invite/.test(lower) ||
        lower === 'userid' ||
        lower === 'user_id' ||
        lower === 'applesubject' ||
        lower === 'sub'
      ) {
        out[key] = evidenceRef(item);
      } else {
        out[key] = redactUnknown(item);
      }
    }
    return out;
  }
  return value;
}

module.exports = {
  IOS_ROOT,
  SECRET_ENV_KEYS,
  classifyPublicUrl,
  collectInventory,
  copySqliteFiles,
  envPresence,
  evidenceRef,
  fetchAppleJwksMeta,
  looksLikeJwt,
  redactUnknown,
  requestJson,
  restoreSqliteFiles,
  runNpm,
  sqliteMigrationCount,
  sqliteTableNames,
  startFamilyApi,
  stopFamilyApi,
  tmpVolume() {
    return process.env.LAMPY_FAMILY_ACCEPT_VOLUME
      ? path.resolve(process.env.LAMPY_FAMILY_ACCEPT_VOLUME)
      : fs.mkdtempSync(path.join(os.tmpdir(), 'lampy-family-accept-'));
  },
};
