'use strict';

const { evidenceRef, redactUnknown, requestJson } = require('./family-identity-lib.cjs');

function isLoopbackHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isPrivateIpv4(hostname) {
  const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(hostname);
  if (!ipv4) return false;
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function sameListenTarget(urlString, listening) {
  if (!listening) return false;
  try {
    const parsed = new URL(urlString);
    return isLoopbackHost(parsed.hostname) && Number(parsed.port) === Number(listening.port);
  } catch {
    return false;
  }
}

function isAuthorizedDeployedUrl(urlString, listening) {
  const raw = String(urlString || '').trim();
  if (!raw) return { ok: false, reason: 'unset' };
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (sameListenTarget(raw, listening)) {
    return { ok: false, reason: 'ephemeral-local-listen' };
  }
  if (parsed.protocol !== 'https:') {
    if (isLoopbackHost(parsed.hostname)) return { ok: false, reason: 'loopback-http-refused' };
    if (isPrivateIpv4(parsed.hostname)) return { ok: false, reason: 'private-http-refused' };
    return { ok: false, reason: 'public-http-refused' };
  }
  if (isLoopbackHost(parsed.hostname)) return { ok: false, reason: 'loopback-refused' };
  if (isPrivateIpv4(parsed.hostname)) return { ok: false, reason: 'private-network-refused' };
  return { ok: true, href: raw.replace(/\/+$/, '') };
}

async function callFamily(baseUrl, method, pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;
  const response = await requestJson(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: options.body,
  });
  return {
    status: response.status,
    errorCode: response.body?.error?.code,
    body: redactUnknown(response.body),
    raw: response.body,
  };
}

function vacantMembership(response) {
  if (!response) return { ok: false, reason: 'unexpected-membership' };
  if (response.status === 401) return { ok: false, reason: 'unauthenticated' };
  if (response.status === 500) return { ok: false, reason: 'server-error' };
  if (response.status !== 200) return { ok: false, reason: 'unexpected-membership' };
  const body = response.raw;
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.prototype.hasOwnProperty.call(body, 'family')) {
    return { ok: false, reason: 'unexpected-membership' };
  }
  if (body.family === null) return { ok: true };
  if (body.family && typeof body.family === 'object' && body.family.familyId) {
    return { ok: false, reason: 'already-in-family' };
  }
  return { ok: false, reason: 'unexpected-membership' };
}

function existingFamilyId(membership) {
  const familyId = membership?.raw?.family?.familyId;
  return typeof familyId === 'string' && familyId ? familyId : '';
}

async function readVacantMembership(baseUrl, session, label) {
  let membership;
  try {
    membership = await callFamily(baseUrl, 'GET', '/v1/me/membership', { token: session.sessionToken });
  } catch {
    return { ok: false, step: `membership-${label}-failed`, membership: null };
  }
  const vacant = vacantMembership(membership);
  if (vacant.ok) return { ok: true, membership };
  if (vacant.reason === 'already-in-family') {
    return { ok: false, step: `account-already-in-family-${label}`, membership };
  }
  return { ok: false, step: `membership-${label}-${vacant.reason}`, membership };
}

async function requireAccountsHaveNoFamily(baseUrl, alice, bob) {
  const aliceVacant = await readVacantMembership(baseUrl, alice, 'a');
  if (!aliceVacant.ok) return { ok: false, step: aliceVacant.step, aliceMembership: aliceVacant.membership };
  const bobVacant = await readVacantMembership(baseUrl, bob, 'b');
  if (!bobVacant.ok) return { ok: false, step: bobVacant.step, bobMembership: bobVacant.membership };
  return { ok: true };
}

async function expectMembers(baseUrl, aliceToken, bobToken, count) {
  const aliceMembers = await callFamily(baseUrl, 'GET', '/v1/me/membership', { token: aliceToken });
  const bobMembers = await callFamily(baseUrl, 'GET', '/v1/me/membership', { token: bobToken });
  return {
    aliceMembers,
    bobMembers,
    ok:
      aliceMembers.status === 200 &&
      bobMembers.status === 200 &&
      aliceMembers.raw?.family?.members?.length === count &&
      bobMembers.raw?.family?.members?.length === count,
  };
}

async function inviteAndJoin(baseUrl, alice, bob, familyId, prefix, label) {
  const invited = await callFamily(baseUrl, 'POST', `/v1/families/${familyId}/invitations`, {
    token: alice.sessionToken,
    idempotencyKey: `${prefix}-invite-${label}`,
  });
  if (invited.status !== 200 || !invited.raw?.code) {
    return { ok: false, step: `invite-${label}`, invited };
  }
  const joined = await callFamily(baseUrl, 'POST', '/v1/invitations/accept', {
    token: bob.sessionToken,
    body: { code: invited.raw.code },
    idempotencyKey: `${prefix}-join-${label}`,
  });
  if (joined.status !== 200) {
    return { ok: false, step: `join-${label}`, joined };
  }
  const members = await expectMembers(baseUrl, alice.sessionToken, bob.sessionToken, 2);
  if (!members.ok) {
    return { ok: false, step: `read-members-${label}`, ...members };
  }
  return { ok: true, familyId };
}

async function expectPermissionGone(baseUrl, aliceToken, bobToken) {
  const bobAfter = await callFamily(baseUrl, 'GET', '/v1/me/membership', { token: bobToken });
  const aliceAfter = await callFamily(baseUrl, 'GET', '/v1/me/membership', { token: aliceToken });
  const leftover = await callFamily(baseUrl, 'GET', '/v1/me/membership', { token: bobToken });
  const ok = !bobAfter.raw?.family && aliceAfter.raw?.family?.members?.length === 1 && !leftover.raw?.family;
  return { ok, bobAfter, aliceAfter };
}

async function walkIdentityLoop(baseUrl, tokenA, tokenB, keyPrefix) {
  const aliceAuth = await callFamily(baseUrl, 'POST', '/v1/auth/apple', { body: { identityToken: tokenA } });
  if (aliceAuth.status !== 200 || !aliceAuth.raw?.sessionToken) {
    return { ok: false, signedIn: false, step: 'sign-in-a', aliceAuth };
  }
  const bobAuth = await callFamily(baseUrl, 'POST', '/v1/auth/apple', { body: { identityToken: tokenB } });
  if (bobAuth.status !== 200 || !bobAuth.raw?.sessionToken) {
    return { ok: false, signedIn: true, step: 'sign-in-b', aliceAuth, bobAuth };
  }
  if (aliceAuth.raw.userId && aliceAuth.raw.userId === bobAuth.raw.userId) {
    return { ok: false, signedIn: true, step: 'accounts-not-independent', aliceAuth, bobAuth };
  }

  const alice = { sessionToken: aliceAuth.raw.sessionToken, userId: aliceAuth.raw.userId };
  const bob = { sessionToken: bobAuth.raw.sessionToken, userId: bobAuth.raw.userId };
  const vacant = await requireAccountsHaveNoFamily(baseUrl, alice, bob);
  if (!vacant.ok) {
    return { ok: false, signedIn: true, step: vacant.step, vacant };
  }

  const created = await callFamily(baseUrl, 'POST', '/v1/families', {
    token: alice.sessionToken,
    idempotencyKey: `${keyPrefix}-create`,
  });
  if (created.status !== 200 || !created.raw?.familyId) {
    return { ok: false, signedIn: true, step: 'create-family', created };
  }
  const familyId = created.raw.familyId;

  const firstJoin = await inviteAndJoin(baseUrl, alice, bob, familyId, keyPrefix, '1');
  if (!firstJoin.ok) return { ...firstJoin, signedIn: true };

  const removed = await callFamily(baseUrl, 'POST', `/v1/families/${familyId}/members/${bob.userId}/remove`, {
    token: alice.sessionToken,
  });
  if (removed.status !== 200 || removed.raw?.removed !== true) {
    return { ok: false, signedIn: true, step: 'creator-remove', removed };
  }
  const goneAfterRemove = await expectPermissionGone(baseUrl, alice.sessionToken, bob.sessionToken);
  if (!goneAfterRemove.ok) {
    return { ok: false, signedIn: true, step: 'permission-gone-after-remove', ...goneAfterRemove };
  }

  const secondJoin = await inviteAndJoin(baseUrl, alice, bob, familyId, keyPrefix, '2');
  if (!secondJoin.ok) return { ...secondJoin, signedIn: true };

  const left = await callFamily(baseUrl, 'POST', '/v1/me/leave', { token: bob.sessionToken });
  if (left.status !== 200 || left.raw?.left !== true) {
    return { ok: false, signedIn: true, step: 'member-leave', left };
  }
  const goneAfterLeave = await expectPermissionGone(baseUrl, alice.sessionToken, bob.sessionToken);
  if (!goneAfterLeave.ok) {
    return { ok: false, signedIn: true, step: 'permission-gone-after-leave', ...goneAfterLeave };
  }

  let dissolved;
  try {
    dissolved = await callFamily(baseUrl, 'POST', `/v1/families/${familyId}/dissolve`, {
      token: alice.sessionToken,
      idempotencyKey: `${keyPrefix}-cleanup-created`,
    });
  } catch {
    dissolved = null;
  }
  const cleanup = createdFamilyCleanupResult(dissolved, familyId);
  if (!cleanup.ok) {
    return { ...cleanup, signedIn: true, dissolved };
  }
  const afterCleanup = await readVacantMembership(baseUrl, alice, 'cleanup');
  if (!afterCleanup.ok) {
    return {
      ok: false,
      signedIn: true,
      step: 'created-family-cleanup-failed',
      leftoverFamily: evidenceRef(familyId),
      needsManualCleanup: true,
      createdFamilyCleanup: 'left-in-place',
      afterCleanup,
    };
  }

  return {
    ok: true,
    signedIn: true,
    operations: ['invite', 'join', 'creator-remove', 'invite', 'join', 'member-leave'],
    alice: evidenceRef(alice.userId),
    bob: evidenceRef(bob.userId),
    family: evidenceRef(familyId),
    createdFamilyCleanup: 'dissolved-created',
    needsManualCleanup: false,
  };
}

function createdFamilyCleanupResult(dissolved, familyId) {
  if (!dissolved || dissolved.status !== 200 || dissolved.raw?.dissolved !== true) {
    return {
      ok: false,
      step: 'created-family-cleanup-failed',
      leftoverFamily: evidenceRef(familyId),
      needsManualCleanup: true,
      createdFamilyCleanup: 'left-in-place',
    };
  }
  return { ok: true };
}

function tokenPairStatus(tokenA, tokenB, testTokensSet) {
  if (!tokenA && !tokenB) return { kind: 'missing' };
  const { looksLikeJwt } = require('./family-identity-lib.cjs');
  if (!looksLikeJwt(tokenA) || !looksLikeJwt(tokenB)) return { kind: 'not-jwt' };
  if (testTokensSet) return { kind: 'test-tokens-present' };
  return { kind: 'jwt' };
}

module.exports = {
  callFamily,
  createdFamilyCleanupResult,
  existingFamilyId,
  isAuthorizedDeployedUrl,
  isLoopbackHost,
  isPrivateIpv4,
  requireAccountsHaveNoFamily,
  sameListenTarget,
  tokenPairStatus,
  vacantMembership,
  walkIdentityLoop,
};
