import { isIP } from 'node:net';

export function publicTestAuthPlan(env: Partial<NodeJS.ProcessEnv>) {
  const enabled = env.LAMPY_PUBLIC_TEST_LOGIN === '1';
  if (!enabled) return { enabled: false };
  if (env.LAMPY_FAMILY_API_MODE !== 'production' ||
      env.LAMPY_FAMILY_API_HOST !== '127.0.0.1' ||
      env.LAMPY_PUBLIC_TEST_TRUST_LOOPBACK_PROXY !== '1' ||
      /^(1|true|yes)$/i.test(env.LAMPY_TEST_ACCOUNT_LOGIN || '') ||
      /^(1|true|yes)$/i.test(env.LAMPY_CONTROLLED_EMAIL_ACCOUNTS || '')) {
    throw new Error('Public test login requires production, explicit 127.0.0.1 binding, trusted local proxy, and both legacy account gates closed.');
  }
  return { enabled: true };
}

// Caddy must overwrite this header with {remote_host}; never accept X-Forwarded-For.
export function publicTestPeer(remote: string | undefined, raw: string | string[] | undefined) {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote || '') ||
      typeof raw !== 'string' || !isIP(raw)) return undefined;
  return raw.startsWith('::ffff:') && isIP(raw.slice(7)) === 4 ? raw.slice(7) : raw;
}

// Bound retained authentication requests, including slow bodies, before hashing.
export function createPublicAuthAdmission(max = 4) {
  let active = 0;
  return () => {
    if (active >= max) return undefined;
    active += 1;
    let released = false;
    return () => { if (!released) { released = true; active -= 1; } };
  };
}

export function isPublicAuthRequest(method: string | undefined, route: string) {
  return (method || '').toUpperCase() === 'POST' && (/^\/v[12]\/auth\//.test(route) || route === '/v2/me/account/delete');
}

// Request-body deadline only. Cancel as soon as the body is read, before queued Argon2.
export function publicAuthBodyDeadline(destroy: () => void, delayMs = 10_000) {
  const timer = setTimeout(destroy, delayMs);
  return () => clearTimeout(timer);
}
