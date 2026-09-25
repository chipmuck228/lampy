import { FAMILY_ERROR, FamilyError, isFamilyError } from './errors';
import type { FamilyCommands } from './commands';

export type FamilyHttpRequest = {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body?: unknown;
};

export type FamilyHttpResponse = {
  status: number;
  body: unknown;
};

function header(headers: FamilyHttpRequest['headers'], name: string) {
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return match?.[1];
}

function bearer(headers: FamilyHttpRequest['headers']) {
  const value = header(headers, 'authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1];
}

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

function statusFor(code: string) {
  switch (code) {
    case FAMILY_ERROR.UNAUTHENTICATED:
    case FAMILY_ERROR.APPLE_TOKEN_INVALID:
      return 401;
    case FAMILY_ERROR.FORBIDDEN:
      return 403;
    case FAMILY_ERROR.INVITE_NOT_FOUND:
    case FAMILY_ERROR.MEMBER_NOT_FOUND:
    case FAMILY_ERROR.NOT_IN_FAMILY:
      return 404;
    case FAMILY_ERROR.ALREADY_IN_FAMILY:
    case FAMILY_ERROR.INVITE_EXPIRED:
    case FAMILY_ERROR.INVITE_REVOKED:
    case FAMILY_ERROR.INVITE_ALREADY_USED:
    case FAMILY_ERROR.FAMILY_DISSOLVED:
    case FAMILY_ERROR.CONFLICT:
      return 409;
    case FAMILY_ERROR.BAD_REQUEST:
      return 400;
    default:
      return 400;
  }
}

function fail(error: unknown): FamilyHttpResponse {
  if (isFamilyError(error)) {
    return { status: statusFor(error.code), body: { error: { code: error.code, message: error.message } } };
  }
  return {
    status: 500,
    body: { error: { code: 'INTERNAL', message: 'Family API failed.' } },
  };
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

export async function dispatchFamilyApi(
  commands: FamilyCommands,
  request: FamilyHttpRequest,
): Promise<FamilyHttpResponse> {
  const method = request.method.toUpperCase();
  const path = request.path.replace(/\/+$/, '') || '/';
  const token = bearer(request.headers);
  const idempotencyKey = header(request.headers, 'idempotency-key');
  const body = asRecord(request.body);

  try {
    if (method === 'GET' && path === '/health') {
      return { status: 200, body: { ok: true, slice: 'F1-identity-membership' } };
    }

    if (method === 'POST' && path === '/v1/auth/apple') {
      const result = await commands.signInWithApple(readString(body, 'identityToken'));
      return { status: 200, body: result };
    }

    if (method === 'POST' && path === '/v1/families') {
      return { status: 200, body: commands.createFamily(token || '', idempotencyKey) };
    }

    const inviteCreate = /^\/v1\/families\/([^/]+)\/invitations$/.exec(path);
    if (method === 'POST' && inviteCreate) {
      return { status: 200, body: commands.inviteMember(token || '', inviteCreate[1], idempotencyKey) };
    }

    const inviteRevoke = /^\/v1\/invitations\/([^/]+)\/revoke$/.exec(path);
    if (method === 'POST' && inviteRevoke) {
      return { status: 200, body: commands.revokeInvitation(token || '', inviteRevoke[1]) };
    }

    if (method === 'POST' && path === '/v1/invitations/accept') {
      return { status: 200, body: commands.acceptInvitation(token || '', readString(body, 'code'), idempotencyKey) };
    }

    if (method === 'GET' && path === '/v1/me/membership') {
      return { status: 200, body: commands.listMembership(token || '') };
    }

    if (method === 'POST' && path === '/v1/me/leave') {
      return { status: 200, body: commands.leaveFamily(token || '') };
    }

    const remove = /^\/v1\/families\/([^/]+)\/members\/([^/]+)\/remove$/.exec(path);
    if (method === 'POST' && remove) {
      return { status: 200, body: commands.removeMember(token || '', remove[1], remove[2]) };
    }

    const dissolve = /^\/v1\/families\/([^/]+)\/dissolve$/.exec(path);
    if (method === 'POST' && dissolve) {
      return { status: 200, body: commands.dissolveFamily(token || '', dissolve[1]) };
    }

    throw new FamilyError(FAMILY_ERROR.BAD_REQUEST, 'Unknown family API route.');
  } catch (error) {
    return fail(error);
  }
}
