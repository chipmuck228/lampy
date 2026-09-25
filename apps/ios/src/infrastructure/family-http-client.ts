import { ApplicationError } from '../application/errors';
import type {
  FamilyView,
  InvitationView,
  MediaObjectView,
  MembershipListView,
  RevokeShareResult,
  ShareMediaView,
  ShareMomentInput,
  ShareView,
  SignInResult,
} from '../family-api/types';
import { isSafeFamilyApiBaseUrl } from './family-config';
import { consumeFamilyTestNextRequestFailure } from './family-test-driver';

export type FamilyTransportRequest = {
  method: string;
  path: string;
  sessionToken?: string;
  idempotencyKey?: string;
  body?: unknown;
  bytes?: Uint8Array;
  contentType?: string;
  expectBytes?: boolean;
};

export type FamilyTransportResponse = {
  status: number;
  body: unknown;
  bytes?: Uint8Array;
};

export type FamilyTransport = {
  request(input: FamilyTransportRequest): Promise<FamilyTransportResponse>;
};

function familyFetchBody(input: FamilyTransportRequest): BodyInit | undefined {
  if (input.bytes) return input.bytes as unknown as BodyInit;
  if (input.body === undefined) return undefined;
  return JSON.stringify(input.body);
}

export type FamilyApiClient = {
  signInWithApple(identityToken: string): Promise<SignInResult>;
  createFamily(sessionToken: string, idempotencyKey: string): Promise<FamilyView>;
  inviteMember(sessionToken: string, familyId: string, idempotencyKey: string): Promise<InvitationView>;
  revokeInvitation(sessionToken: string, invitationId: string): Promise<InvitationView>;
  acceptInvitation(sessionToken: string, code: string, idempotencyKey: string): Promise<FamilyView>;
  listMembership(sessionToken: string): Promise<MembershipListView>;
  listPendingInvitations(sessionToken: string, familyId: string): Promise<InvitationView[]>;
  leaveFamily(sessionToken: string): Promise<{ left: true }>;
  removeMember(sessionToken: string, familyId: string, userId: string): Promise<{ removed: true }>;
  dissolveFamily(sessionToken: string, familyId: string): Promise<{ dissolved: true }>;
  signOut(sessionToken: string): Promise<{ signedOut: true }>;
  uploadMedia(
    sessionToken: string,
    input: { bytes: Uint8Array; mimeType: string; idempotencyKey?: string },
  ): Promise<MediaObjectView>;
  getMediaObject(sessionToken: string, objectId: string): Promise<MediaObjectView>;
  getMediaContent(sessionToken: string, objectId: string): Promise<{ mimeType: string; bytes: Uint8Array }>;
  shareMoment(sessionToken: string, familyId: string, input: ShareMomentInput): Promise<ShareView>;
  revokeShare(sessionToken: string, familyId: string, shareId: string): Promise<RevokeShareResult>;
  listVisibleShares(sessionToken: string, familyId: string): Promise<{ shares: ShareView[] }>;
  getShare(sessionToken: string, familyId: string, shareId: string): Promise<ShareView>;
  getShareMedia(sessionToken: string, familyId: string, shareId: string, objectId: string): Promise<ShareMediaView>;
  getShareMediaContent(
    sessionToken: string,
    familyId: string,
    shareId: string,
    objectId: string,
  ): Promise<{ mimeType: string; bytes: Uint8Array }>;
};

type ErrorBody = { error?: { code?: string; message?: string } };

function throwIfFailed(status: number, body: unknown): void {
  if (status >= 200 && status < 300) return;
  const error = (body || {}) as ErrorBody;
  const code = error.error?.code || (status === 0 ? 'SERVER_UNREACHABLE' : 'NETWORK');
  const message = error.error?.message || 'Family request failed.';
  throw new ApplicationError(code, message);
}

export function createFamilyApiClient(transport: FamilyTransport): FamilyApiClient {
  async function send<T>(input: Parameters<FamilyTransport['request']>[0]): Promise<T> {
    let response: { status: number; body: unknown };
    try {
      response = await transport.request(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Family server is unreachable.';
      throw new ApplicationError('SERVER_UNREACHABLE', message);
    }
    throwIfFailed(response.status, response.body);
    return response.body as T;
  }

  return {
    signInWithApple(identityToken) {
      return send({ method: 'POST', path: '/v1/auth/apple', body: { identityToken } });
    },
    createFamily(sessionToken, idempotencyKey) {
      return send({ method: 'POST', path: '/v1/families', sessionToken, idempotencyKey });
    },
    inviteMember(sessionToken, familyId, idempotencyKey) {
      return send({
        method: 'POST',
        path: `/v1/families/${familyId}/invitations`,
        sessionToken,
        idempotencyKey,
      });
    },
    revokeInvitation(sessionToken, invitationId) {
      return send({ method: 'POST', path: `/v1/invitations/${invitationId}/revoke`, sessionToken });
    },
    acceptInvitation(sessionToken, code, idempotencyKey) {
      return send({
        method: 'POST',
        path: '/v1/invitations/accept',
        sessionToken,
        idempotencyKey,
        body: { code },
      });
    },
    listMembership(sessionToken) {
      return send({ method: 'GET', path: '/v1/me/membership', sessionToken });
    },
    listPendingInvitations(sessionToken, familyId) {
      return send({ method: 'GET', path: `/v1/families/${familyId}/invitations`, sessionToken });
    },
    leaveFamily(sessionToken) {
      return send({ method: 'POST', path: '/v1/me/leave', sessionToken });
    },
    removeMember(sessionToken, familyId, userId) {
      return send({
        method: 'POST',
        path: `/v1/families/${familyId}/members/${userId}/remove`,
        sessionToken,
      });
    },
    dissolveFamily(sessionToken, familyId) {
      return send({ method: 'POST', path: `/v1/families/${familyId}/dissolve`, sessionToken });
    },
    signOut(sessionToken) {
      return send({ method: 'POST', path: '/v1/auth/sign-out', sessionToken });
    },
    uploadMedia(sessionToken, input) {
      return send({
        method: 'POST',
        path: '/v1/media',
        sessionToken,
        idempotencyKey: input.idempotencyKey,
        bytes: input.bytes,
        contentType: input.mimeType,
      });
    },
    getMediaObject(sessionToken, objectId) {
      return send({ method: 'GET', path: `/v1/media/${objectId}`, sessionToken });
    },
    shareMoment(sessionToken, familyId, input) {
      return send({
        method: 'POST',
        path: `/v1/families/${familyId}/shares`,
        sessionToken,
        idempotencyKey: input.idempotencyKey,
        body: {
          sourceMomentId: input.sourceMomentId,
          sourceRevision: input.sourceRevision,
          note: input.note,
          emotion: input.emotion,
          occurredAt: input.occurredAt,
          occurredAtPrecision: input.occurredAtPrecision,
          mediaObjectIds: input.mediaObjectIds,
          expectedMediaCount: input.expectedMediaCount,
        },
      });
    },
    revokeShare(sessionToken, familyId, shareId) {
      return send({
        method: 'POST',
        path: `/v1/families/${familyId}/shares/${shareId}/revoke`,
        sessionToken,
      });
    },
    listVisibleShares(sessionToken, familyId) {
      return send({ method: 'GET', path: `/v1/families/${familyId}/shares`, sessionToken });
    },
    getShare(sessionToken, familyId, shareId) {
      return send({ method: 'GET', path: `/v1/families/${familyId}/shares/${shareId}`, sessionToken });
    },
    getShareMedia(sessionToken, familyId, shareId, objectId) {
      return send({
        method: 'GET',
        path: `/v1/families/${familyId}/shares/${shareId}/media/${objectId}`,
        sessionToken,
      });
    },
    async getShareMediaContent(sessionToken, familyId, shareId, objectId) {
      let response: FamilyTransportResponse;
      try {
        response = await transport.request({
          method: 'GET',
          path: `/v1/families/${familyId}/shares/${shareId}/media/${objectId}/content`,
          sessionToken,
          expectBytes: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Family server is unreachable.';
        throw new ApplicationError('SERVER_UNREACHABLE', message);
      }
      throwIfFailed(response.status, response.body);
      if (!response.bytes) {
        throw new ApplicationError('SHARE_MEDIA_UNAVAILABLE', 'A selected media object is not available.');
      }
      const meta = (response.body || {}) as { mimeType?: string };
      return { mimeType: meta.mimeType || 'application/octet-stream', bytes: response.bytes };
    },
    async getMediaContent(sessionToken, objectId) {
      let response: FamilyTransportResponse;
      try {
        response = await transport.request({
          method: 'GET',
          path: `/v1/media/${objectId}/content`,
          sessionToken,
          expectBytes: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Family server is unreachable.';
        throw new ApplicationError('SERVER_UNREACHABLE', message);
      }
      throwIfFailed(response.status, response.body);
      if (!response.bytes) {
        throw new ApplicationError('MEDIA_NOT_FOUND', 'Media object was not found.');
      }
      const meta = (response.body || {}) as { mimeType?: string };
      return { mimeType: meta.mimeType || 'application/octet-stream', bytes: response.bytes };
    },
  };
}

export function createFamilyHttpTransport(deps: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): FamilyTransport {
  const baseUrl = deps.baseUrl.replace(/\/+$/, '');
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  return {
    async request(input) {
      if (!baseUrl) {
        throw new ApplicationError('SERVER_UNREACHABLE', 'Family API base URL is not configured.');
      }
      if (!isSafeFamilyApiBaseUrl(baseUrl)) {
        throw new ApplicationError(
          'SERVER_UNREACHABLE',
          'Family API must use HTTPS except on this device\'s local network.',
        );
      }
      if (!fetchImpl) {
        throw new ApplicationError('SERVER_UNREACHABLE', 'No HTTP fetch is available.');
      }
      if (consumeFamilyTestNextRequestFailure()) {
        throw new ApplicationError('NETWORK', 'The test driver armed a single request failure.');
      }
      const headers: Record<string, string> = { accept: input.expectBytes ? '*/*' : 'application/json' };
      if (input.bytes) headers['content-type'] = input.contentType || 'application/octet-stream';
      else if (input.body !== undefined) headers['content-type'] = 'application/json';
      if (input.sessionToken) headers.authorization = `Bearer ${input.sessionToken}`;
      if (input.idempotencyKey) headers['idempotency-key'] = input.idempotencyKey;
      const response = await fetchImpl(`${baseUrl}${input.path}`, {
        method: input.method,
        headers,
        body: familyFetchBody(input),
      });
      if (input.expectBytes && response.ok) {
        const buffer = await response.arrayBuffer();
        return {
          status: response.status,
          body: {
            mimeType: response.headers.get('content-type') || 'application/octet-stream',
            byteLength: buffer.byteLength,
          },
          bytes: new Uint8Array(buffer),
        };
      }
      const text = await response.text();
      let body: unknown = undefined;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = { error: { code: 'NETWORK', message: 'Family API returned a non-JSON body.' } };
        }
      }
      return { status: response.status, body };
    },
  };
}

export function createDispatchTransport(
  dispatch: (request: {
    method: string;
    path: string;
    headers: Record<string, string | undefined>;
    body?: unknown;
    bytes?: Uint8Array;
  }) => Promise<{ status: number; body: unknown; bytes?: Uint8Array; contentType?: string }>,
): FamilyTransport {
  return {
    async request(input) {
      const response = await dispatch({
        method: input.method,
        path: input.path,
        headers: {
          authorization: input.sessionToken ? `Bearer ${input.sessionToken}` : undefined,
          'idempotency-key': input.idempotencyKey,
          'content-type': input.contentType,
        },
        body: input.body,
        bytes: input.bytes,
      });
      if (response.bytes) {
        return {
          status: response.status,
          body: response.body,
          bytes: response.bytes,
        };
      }
      return { status: response.status, body: response.body };
    },
  };
}
