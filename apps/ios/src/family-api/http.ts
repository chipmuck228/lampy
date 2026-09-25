import { FAMILY_ERROR, FamilyError, isFamilyError } from './errors';
import type { FamilyCommands } from './commands';

export type FamilyHttpRequest = {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body?: unknown;
  bytes?: Uint8Array;
};

export type FamilyHttpResponse = {
  status: number;
  body: unknown;
  bytes?: Uint8Array;
  contentType?: string;
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
    case FAMILY_ERROR.MEDIA_CORRUPT:
      return 400;
    case FAMILY_ERROR.MEDIA_NOT_FOUND:
      return 404;
    case FAMILY_ERROR.MEDIA_TOO_LARGE:
      return 413;
    case FAMILY_ERROR.MEDIA_UNSUPPORTED:
      return 415;
    case FAMILY_ERROR.MEDIA_WRITE_FAILED:
      return 507;
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
      return { status: 200, body: { ok: true, slice: 'identity-membership', media: true } };
    }

    if (method === 'POST' && path === '/v1/auth/apple') {
      return { status: 200, body: await commands.signInWithApple(readString(body, 'identityToken')) };
    }

    if (method === 'POST' && path === '/v1/auth/sign-out') {
      return { status: 200, body: await commands.signOut(token || '') };
    }

    if (method === 'POST' && path === '/v1/families') {
      return { status: 200, body: await commands.createFamily(token || '', idempotencyKey) };
    }

    const inviteCreate = /^\/v1\/families\/([^/]+)\/invitations$/.exec(path);
    if (method === 'POST' && inviteCreate) {
      return { status: 200, body: await commands.inviteMember(token || '', inviteCreate[1], idempotencyKey) };
    }
    if (method === 'GET' && inviteCreate) {
      return { status: 200, body: await commands.listPendingInvitations(token || '', inviteCreate[1]) };
    }

    const inviteRevoke = /^\/v1\/invitations\/([^/]+)\/revoke$/.exec(path);
    if (method === 'POST' && inviteRevoke) {
      return { status: 200, body: await commands.revokeInvitation(token || '', inviteRevoke[1]) };
    }

    if (method === 'POST' && path === '/v1/invitations/accept') {
      return {
        status: 200,
        body: await commands.acceptInvitation(token || '', readString(body, 'code'), idempotencyKey),
      };
    }

    if (method === 'GET' && path === '/v1/me/membership') {
      return { status: 200, body: await commands.listMembership(token || '') };
    }

    if (method === 'POST' && path === '/v1/me/leave') {
      return { status: 200, body: await commands.leaveFamily(token || '') };
    }

    const remove = /^\/v1\/families\/([^/]+)\/members\/([^/]+)\/remove$/.exec(path);
    if (method === 'POST' && remove) {
      return { status: 200, body: await commands.removeMember(token || '', remove[1], remove[2]) };
    }

    const dissolve = /^\/v1\/families\/([^/]+)\/dissolve$/.exec(path);
    if (method === 'POST' && dissolve) {
      return { status: 200, body: await commands.dissolveFamily(token || '', dissolve[1]) };
    }

    if (method === 'POST' && path === '/v1/media') {
      return {
        status: 200,
        body: await commands.uploadMedia(token || '', {
          bytes: request.bytes || new Uint8Array(),
          mimeType: header(request.headers, 'content-type') || '',
          idempotencyKey: idempotencyKey || undefined,
        }),
      };
    }

    const mediaMeta = /^\/v1\/media\/([^/]+)$/.exec(path);
    if (method === 'GET' && mediaMeta) {
      return { status: 200, body: await commands.getMediaObject(token || '', mediaMeta[1]) };
    }

    const mediaContent = /^\/v1\/media\/([^/]+)\/content$/.exec(path);
    if (method === 'GET' && mediaContent) {
      const content = await commands.getMediaContent(token || '', mediaContent[1]);
      return { status: 200, body: { objectId: mediaContent[1], mimeType: content.mimeType, byteLength: content.bytes.length }, bytes: content.bytes, contentType: content.mimeType };
    }

    throw new FamilyError(FAMILY_ERROR.BAD_REQUEST, 'Unknown family API route.');
  } catch (error) {
    return fail(error);
  }
}
