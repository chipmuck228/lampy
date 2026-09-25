import { ApplicationError } from '../application/errors';
import type { FamilyView, InvitationView, MembershipListView, SignInResult } from '../family-api/types';

export type FamilyTransport = {
  request(input: {
    method: string;
    path: string;
    sessionToken?: string;
    idempotencyKey?: string;
    body?: unknown;
  }): Promise<{ status: number; body: unknown }>;
};

export type FamilyApiClient = {
  signInWithApple(identityToken: string): Promise<SignInResult>;
  createFamily(sessionToken: string, idempotencyKey: string): Promise<FamilyView>;
  inviteMember(sessionToken: string, familyId: string, idempotencyKey: string): Promise<InvitationView>;
  revokeInvitation(sessionToken: string, invitationId: string): Promise<InvitationView>;
  acceptInvitation(sessionToken: string, code: string, idempotencyKey: string): Promise<FamilyView>;
  listMembership(sessionToken: string): Promise<MembershipListView>;
  leaveFamily(sessionToken: string): Promise<{ left: true }>;
  removeMember(sessionToken: string, familyId: string, userId: string): Promise<{ removed: true }>;
  dissolveFamily(sessionToken: string, familyId: string): Promise<{ dissolved: true }>;
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
      if (!fetchImpl) {
        throw new ApplicationError('SERVER_UNREACHABLE', 'No HTTP fetch is available.');
      }
      const headers: Record<string, string> = { accept: 'application/json' };
      if (input.body !== undefined) headers['content-type'] = 'application/json';
      if (input.sessionToken) headers.authorization = `Bearer ${input.sessionToken}`;
      if (input.idempotencyKey) headers['idempotency-key'] = input.idempotencyKey;
      const response = await fetchImpl(`${baseUrl}${input.path}`, {
        method: input.method,
        headers,
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
      });
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
  }) => Promise<{ status: number; body: unknown }>,
): FamilyTransport {
  return {
    request(input) {
      return dispatch({
        method: input.method,
        path: input.path,
        headers: {
          authorization: input.sessionToken ? `Bearer ${input.sessionToken}` : undefined,
          'idempotency-key': input.idempotencyKey,
        },
        body: input.body,
      });
    },
  };
}
