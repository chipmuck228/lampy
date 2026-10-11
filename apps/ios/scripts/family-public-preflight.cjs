const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');

// Read configuration and filesystem metadata only. Never open SQLite, send requests,
// create directories, resolve DNS, or print env values/tokens/paths.
function evaluate(env) {
  const checks = [];
  const add = (id, ok, reason) => checks.push({ id, status: ok ? 'PASS' : 'FAIL', reason });
  add('durable_mode', env.LAMPY_FAMILY_API_MODE === 'production', 'Require production SQLite mode.');
  add('apple_audience', env.LAMPY_APPLE_CLIENT_ID === 'app.lampy.ios', 'Require the current iOS bundle audience.');
  const on = value => /^(1|true|yes)$/i.test((value || '').trim());
  add('no_test_tokens', !(env.LAMPY_FAMILY_API_TEST_TOKENS || '').trim(), 'Test identity tokens must be unset.');
  add('public_auth_boundary', !on(env.LAMPY_TEST_ACCOUNT_LOGIN) && !on(env.LAMPY_CONTROLLED_EMAIL_ACCOUNTS), 'Unverified controlled-email/test login must not be exposed by this public profile.');
  add('backend_loopback', (env.LAMPY_FAMILY_API_HOST || '127.0.0.1') === '127.0.0.1', 'Bind Node behind the HTTPS proxy on IPv4 loopback.');
  const port = Number(env.LAMPY_FAMILY_API_PORT || 8787);
  add('backend_port', Number.isInteger(port) && port > 0 && port <= 65535, 'Require a valid backend TCP port; proxy must match it.');
  function origin(raw) {
    try {
      const u = new URL(raw);
      const host = u.hostname.toLowerCase();
      return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash && u.pathname === '/' && !u.port
        && host.includes('.') && !net.isIP(host.replace(/^\[|\]$/g, ''))
        && !/(^|\.)(localhost|local|test|invalid|example\.com|example\.org|example\.net)$/.test(host)
        ? u.origin : null;
    } catch { return null; }
  }
  const serverOrigin = origin(env.LAMPY_FAMILY_INVITE_ORIGIN);
  const clientOrigin = origin(env.EXPO_PUBLIC_FAMILY_API_BASE_URL);
  add('invite_https_origin', Boolean(serverOrigin), 'Require a real candidate HTTPS origin without credentials, path, query or fragment. DNS/TLS remain unverified.');
  add('client_origin_matches', Boolean(serverOrigin && serverOrigin === clientOrigin), 'Client API and invitation origins must match.');
  add('invite_and_history_flags', env.LAMPY_FAMILY_INVITES_ENABLED === '1' && env.LAMPY_FAMILY_HISTORY_ENABLED === '1', 'Candidate integration needs both v2 invitation/history flags. This tool does not enable them.');
  function real(raw, directory) {
    try { return raw && path.isAbsolute(raw) && (directory ? fs.statSync(raw).isDirectory() : fs.statSync(raw).isFile()) ? fs.realpathSync(raw) : null; }
    catch { return null; }
  }
  const root = real(env.LAMPY_FAMILY_PREFLIGHT_VOLUME_ROOT, true);
  const db = real(env.LAMPY_FAMILY_DATABASE_PATH, false);
  const media = real(env.LAMPY_FAMILY_MEDIA_PATH, true);
  const within = file => { if (!root || !file) return false; const relative = path.relative(root, file); return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
  add('declared_storage_root', Boolean(root && root !== path.parse(root).root), 'Provide an existing explicit storage root. This cannot prove a durable mount.');
  add('existing_database_under_root', within(db), 'Existing database must resolve under the declared root; no new database is created.');
  add('existing_media_under_root', within(media), 'Existing media directory must resolve under the same declared root.');
  return {
    kind: 'configuration-only', configChecksPassed: checks.every(c => c.status === 'PASS'), checks,
    publicReady: false, identityLoopAccepted: false,
    notVerified: ['schema26-and-backup-restore', 'actual-durable-mount-and-single-process', 'dns-tls-public-reachability', 'aasa-and-installed-entitlements', 'real-apple-sign-in', 'external-invite-and-uninstalled-install-reopen', 'dual-real-device-share-media-revoke-and-protection'],
  };
}
if (require.main === module) {
  const report = evaluate(process.env);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.configChecksPassed ? 0 : 2;
}
module.exports = { evaluate };
