import {familyNetworkError,type FamilyNetworkDiagnostic} from './family-network-diagnostic';
import { ApplicationError } from '../application/errors';
import type {
  FamilyView,
  FamilyListView,
  FamilySummary,
  InvitationView,
  MediaObjectView,
  MembershipListView,
  RevokeShareResult,
  ShareMediaView,
  ShareMomentInput,
  ShareView,
  SignInResult,
  FamilyHealth,
} from '../family-api/types';
import { isSafeFamilyApiBaseUrl } from './family-config';
import { consumeFamilyTestNextRequestFailure, recordFamilyTestLastRequest } from './family-test-driver';

export function familyTestPathKind(method: string, path: string) {
  const verb = method.toUpperCase();
  if (path === '/v1/invitations/accept') return 'accept';
  if (path === '/v1/auth/apple' || path === '/v1/auth/test-account') return 'sign-in';
  if (path === '/v1/families') return 'create';
  if (path === '/v1/me/membership') return 'membership';
  if (path.includes('/invitations') && !path.includes('/revoke')) return 'invite';
  if (path.includes('/shares') && path.endsWith('/revoke')) return 'revoke-share';
  if (path.includes('/shares/') && path.includes('/media')) return 'receive-media';
  if (verb === 'GET' && /\/shares\/[^/]+$/.test(path)) return 'receive';
  if (verb === 'GET' && /\/shares$/.test(path)) return 'shares';
  if (verb === 'POST' && /\/shares$/.test(path)) return 'share';
  return 'other';
}

export type FamilyTransportRequest = {
  timeoutMs?: number;
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
  safety?: import('../family-api/safety-types').FamilySafetyApi;
  purchases?: import('../family-api/purchase-types').PurchaseApi;
  albums?: import('../family-api/family-album-types').FamilyAlbumApi;
  registerControlledEmail?(input: { email: string; password: string; nickname: string }): Promise<SignInResult>;
  signInWithControlledEmail?(input: { email: string; password: string }): Promise<SignInResult>;
  getMyProfile?(sessionToken: string): Promise<import('../family-api/types').UserProfile>;
  updateMyProfile?(sessionToken: string, nickname: string): Promise<import('../family-api/types').UserProfile>;
  health(): Promise<FamilyHealth>;
  getHistoryPolicy?(session: string, familyId: string): Promise<{ policy: 'legacy' | 'family-history-v2' }>;
  confirmHistoryPolicy?(session: string, familyId: string): Promise<{ policy: 'family-history-v2' }>;
  history?: Pick<FamilyApiClient, 'shareMoment' | 'revokeShare' | 'listVisibleShares' | 'getShare' | 'getShareMedia' | 'getShareMediaContent'>;
  listFamilies?(sessionToken: string): Promise<FamilyListView>;
  createNamedFamily?(sessionToken: string, name: string, idempotencyKey: string): Promise<FamilySummary>;
  createInviteLink?(session: string, familyId: string): Promise<import('../family-api/types').CreatedInviteLink & {link: string; qr: string}>;
  listInviteLinks?(session: string, familyId: string): Promise<import('../family-api/types').InviteLinkView[]>;
  revokeInviteLink?(session: string, id: string): Promise<import('../family-api/types').InviteLinkView>;
  previewInviteLink?(token: string): Promise<import('../family-api/types').InvitePreview>;
  acceptInviteLink?(session: string, token: string): Promise<FamilySummary>;
  beginAppleAuth?(intent:'login'|'link'|'delete',sessionToken?:string):Promise<{challengeId:string;nonce:string;expiresAt:string}>;
  completeAppleAuth?(input:import('../family-api/types').AppleAuthInput,sessionToken?:string):Promise<SignInResult | {linked:true;userId:string}>;
  deleteAccount?(sessionToken:string,input:import('../family-api/types').DeleteAccountInput):Promise<import('../family-api/types').DeleteAccountResult>;
  getAppleLink?(sessionToken:string):Promise<{linked:boolean}>;
  signInWithApple(identityToken: string): Promise<SignInResult>;
  signInWithTestAccount(input: { login: string; password: string }): Promise<SignInResult>;
  createFamily(sessionToken: string, idempotencyKey: string): Promise<FamilyView>;
  inviteMember(sessionToken: string, familyId: string, idempotencyKey: string): Promise<InvitationView>;
  revokeInvitation(sessionToken: string, invitationId: string): Promise<InvitationView>;
  acceptInvitation(sessionToken: string, code: string, idempotencyKey: string): Promise<FamilyView>;
  listMembership(sessionToken: string): Promise<MembershipListView>;
  listPendingInvitations(sessionToken: string, familyId: string): Promise<InvitationView[]>;
  getCreatorTransfer?(session: string, familyId: string): Promise<{ transfer: import('../family-api/types').FamilyTransfer | null }>;
  createCreatorTransfer?(session: string, familyId: string, input: { requestId: string; fromMembershipId: string; toMembershipId: string }): Promise<import('../family-api/types').FamilyTransfer>;
  respondCreatorTransfer?(session: string, familyId: string, transferId: string, revision: number, action: 'accept' | 'cancel'): Promise<import('../family-api/types').FamilyTransfer>;
  getFamilyRoster?(sessionToken: string, familyId: string): Promise<import('../family-api/types').FamilyRoster>;
  dissolveSelectedFamily?(sessionToken: string, familyId: string, membershipId: string): Promise<{ dissolved: true }>;
  leaveSelectedFamily?(sessionToken: string, familyId: string, membershipId: string): Promise<{ left: true }>;
  removeSelectedMember?(sessionToken: string, familyId: string, userId: string, membershipId: string): Promise<{ removed: true }>;
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

export function createFamilyApiClient(transport: FamilyTransport, sharingVersion: 1 | 2 = 1): FamilyApiClient {
  const shareBase = `/v${sharingVersion}/families`;
  async function send<T>(input: Parameters<FamilyTransport['request']>[0]): Promise<T> {
    const action = familyTestPathKind(input.method, input.path);
    let response: { status: number; body: unknown };
    try {
      response = await transport.request(input);
    } catch (error) {
      const appError = error instanceof ApplicationError ? error : undefined;
      recordFamilyTestLastRequest({
        action,
        sent: false,
        errorCode: appError?.code || 'SERVER_UNREACHABLE',
      });
      const message = error instanceof Error ? error.message : 'Family server is unreachable.';
      throw appError ?? new ApplicationError('SERVER_UNREACHABLE', message);
    }
    const failed = (response.body || {}) as ErrorBody;
    recordFamilyTestLastRequest({
      action,
      sent: true,
      status: response.status,
      errorCode: response.status >= 200 && response.status < 300
        ? undefined
        : failed.error?.code || (response.status === 0 ? 'SERVER_UNREACHABLE' : 'NETWORK'),
    });
    throwIfFailed(response.status, response.body);
    return response.body as T;
  }

  return {
    safety: {
      report:(sessionToken,familyId,shareId,input)=>send({method:'POST',path:`/v2/families/${encodeURIComponent(familyId)}/shares/${encodeURIComponent(shareId)}/reports`,sessionToken,body:input}),
      reports:sessionToken=>send({method:'GET',path:'/v2/me/safety/reports',sessionToken}),
      blocks:sessionToken=>send({method:'GET',path:'/v2/me/safety/blocks',sessionToken}),
      block:(sessionToken,familyId,target)=>send({method:'PUT',path:`/v2/families/${encodeURIComponent(familyId)}/blocks/${encodeURIComponent(target)}`,sessionToken}),
      unblock:(sessionToken,target)=>send({method:'DELETE',path:`/v2/me/safety/blocks/${encodeURIComponent(target)}`,sessionToken}),
    },
    deleteAccount:(sessionToken,input)=>send({method:'POST',path:'/v2/me/account/delete',sessionToken,body:input,timeoutMs:45000}),
    purchases: {
      context:sessionToken=>send({method:'GET',path:'/v2/me/purchase-access',sessionToken,timeoutMs:12000}),
      claim:(sessionToken,transactionId)=>send({method:'POST',path:'/v2/me/purchase-access',sessionToken,body:{transactionId},timeoutMs:12000}),
      familyAccess:(sessionToken,familyId)=>send({method:'GET',path:`/v2/families/${encodeURIComponent(familyId)}/purchase-access`,sessionToken,timeoutMs:12000}),
      unlockFamily:(sessionToken,familyId)=>send({method:'POST',path:`/v2/families/${encodeURIComponent(familyId)}/purchase-access`,sessionToken,timeoutMs:12000}),
    },
    albums: {
      authorizeExport:(sessionToken,familyId,albumId,validation)=>send({method:'POST',path:`/v2/families/${encodeURIComponent(familyId)}/albums/${encodeURIComponent(albumId)}/export-access`,sessionToken,body:{validation},timeoutMs:12000}),
      access:(sessionToken,familyId)=>send({method:'GET',path:`/v2/families/${encodeURIComponent(familyId)}/album-access`,sessionToken,timeoutMs:5000}),
      acknowledge:(sessionToken,familyId,membershipId,confirmation)=>send({method:'POST',path:`/v2/families/${encodeURIComponent(familyId)}/album-access`,sessionToken,body:{membershipId,confirmation}}),
      list:(sessionToken,familyId)=>send({method:'GET',path:`/v2/families/${encodeURIComponent(familyId)}/albums`,sessionToken,timeoutMs:5000}),
      sources:(sessionToken,familyId)=>send({method:'GET',path:`/v2/families/${encodeURIComponent(familyId)}/album-sources`,sessionToken}),
      create:(sessionToken,familyId,input)=>send({method:'POST',path:`/v2/families/${encodeURIComponent(familyId)}/albums`,sessionToken,body:input}),
      read:(sessionToken,familyId,albumId)=>send({method:'GET',path:`/v2/families/${encodeURIComponent(familyId)}/albums/${encodeURIComponent(albumId)}`,sessionToken}),
      validate:(sessionToken,familyId,albumId,validation)=>send({method:'POST',path:`/v2/families/${encodeURIComponent(familyId)}/albums/${encodeURIComponent(albumId)}/validate`,sessionToken,body:{validation},timeoutMs:5000}),
      mutate:(sessionToken,familyId,albumId,input)=>send({method:'PATCH',path:`/v2/families/${encodeURIComponent(familyId)}/albums/${encodeURIComponent(albumId)}`,sessionToken,body:input}),
    },
    ...(sharingVersion === 1 ? { history: createFamilyApiClient(transport, 2) } : {}),
    getHistoryPolicy(sessionToken, familyId) { return send({ method: 'GET', path: `/v2/families/${familyId}/history-policy`, sessionToken }); },
    confirmHistoryPolicy(sessionToken, familyId) { return send({ method: 'POST', path: `/v2/families/${familyId}/history-policy`, sessionToken, body: { confirmation: 'new-members-can-read-active-history' } }); },
    registerControlledEmail(input) { return send({method:'POST',path:'/v2/auth/email/register',body:input}); },
    signInWithControlledEmail(input) { return send({method:'POST',path:'/v2/auth/email/login',body:input}); },
    getMyProfile(sessionToken) { return send({method:'GET',path:'/v2/me/profile',sessionToken}); },
    updateMyProfile(sessionToken,nickname) { return send({method:'PATCH',path:'/v2/me/profile',sessionToken,body:{nickname}}); },
    health() {
      return send({ method: 'GET', path: '/health' });
    },
    beginAppleAuth(intent,sessionToken) { return send({method:'POST',path:'/v2/auth/apple/challenge',sessionToken,body:{intent}}); },
    completeAppleAuth(input,sessionToken) { return send({method:'POST',path:'/v2/auth/apple/complete',sessionToken,body:input}); },
    getAppleLink(sessionToken) { return send({method:'GET',path:'/v2/me/apple',sessionToken}); },
    signInWithApple(identityToken) {
      return send({ method: 'POST', path: '/v1/auth/apple', body: { identityToken } });
    },
    signInWithTestAccount(input) {
      return send({ method: 'POST', path: '/v1/auth/test-account', body: input });
    },
    listFamilies(sessionToken) {
      return send({ method: 'GET', path: '/v2/me/families', sessionToken, timeoutMs:5000 });
    },
    createNamedFamily(sessionToken, name, idempotencyKey) {
      return send({ method: 'POST', path: '/v2/families', sessionToken, idempotencyKey, body: { name } });
    },
    createInviteLink(sessionToken,familyId) { return send({method:'POST',path:`/v2/families/${familyId}/invitations`,sessionToken}); },
    listInviteLinks(sessionToken,familyId) { return send({method:'GET',path:`/v2/families/${familyId}/invitations`,sessionToken}); },
    revokeInviteLink(sessionToken,id) { return send({method:'POST',path:`/v2/invitations/${id}/revoke`,sessionToken}); },
    previewInviteLink(token) { return send({method:'POST',path:'/v2/invitations/preview',body:{token}}); },
    acceptInviteLink(sessionToken,token) { return send({method:'POST',path:'/v2/invitations/accept',sessionToken,body:{token}}); },
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
    getCreatorTransfer(sessionToken, familyId) {
      return send({ method: 'GET', path: `/v2/families/${encodeURIComponent(familyId)}/creator-transfer`, sessionToken });
    },
    createCreatorTransfer(sessionToken, familyId, body) {
      return send({ method: 'POST', path: `/v2/families/${encodeURIComponent(familyId)}/creator-transfer`, sessionToken, body });
    },
    respondCreatorTransfer(sessionToken, familyId, transferId, revision, action) {
      return send({ method: 'POST', path: `/v2/families/${encodeURIComponent(familyId)}/creator-transfer/${encodeURIComponent(transferId)}/${action}`, sessionToken, body: { revision } });
    },
    getFamilyRoster(sessionToken, familyId) {
      return send({ method: 'GET', path: `/v2/families/${familyId}/members`, sessionToken });
    },
    dissolveSelectedFamily(sessionToken, familyId, membershipId) {
      return send({ method: 'POST', path: `/v2/families/${familyId}/dissolve`, sessionToken, body: { membershipId } });
    },
    leaveSelectedFamily(sessionToken, familyId, membershipId) {
      return send({ method: 'POST', path: `/v2/families/${familyId}/leave`, sessionToken, body: { membershipId } });
    },
    removeSelectedMember(sessionToken, familyId, userId, membershipId) {
      return send({ method: 'POST', path: `/v2/families/${familyId}/members/${userId}/remove`, sessionToken, body: { membershipId } });
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
        path: `${shareBase}/${familyId}/shares`,
        sessionToken,
        idempotencyKey: input.idempotencyKey,
        body: {
          ...(sharingVersion === 2 ? { audienceConfirmation: input.audienceConfirmation } : {}),
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
        path: `${shareBase}/${familyId}/shares/${shareId}/revoke`,
        sessionToken,
      });
    },
    listVisibleShares(sessionToken, familyId) {
      return send({ method: 'GET', path: `${shareBase}/${familyId}/shares`, sessionToken });
    },
    getShare(sessionToken, familyId, shareId) {
      return send({ method: 'GET', path: `${shareBase}/${familyId}/shares/${shareId}`, sessionToken });
    },
    getShareMedia(sessionToken, familyId, shareId, objectId) {
      return send({
        method: 'GET',
        path: `${shareBase}/${familyId}/shares/${shareId}/media/${objectId}`,
        sessionToken,
      });
    },
    async getShareMediaContent(sessionToken, familyId, shareId, objectId) {
      let response: FamilyTransportResponse;
      try {
        response = await transport.request({
          method: 'GET',
          path: `${shareBase}/${familyId}/shares/${shareId}/media/${objectId}/content`,
          sessionToken,
          expectBytes: true,
        });
      } catch (error) {
        const appError = error instanceof ApplicationError ? error : undefined;
        recordFamilyTestLastRequest({
          action: 'receive-media',
          sent: false,
          errorCode: appError?.code || 'SERVER_UNREACHABLE',
        });
        const message = error instanceof Error ? error.message : 'Family server is unreachable.';
        throw new ApplicationError(appError?.code || 'SERVER_UNREACHABLE', message);
      }
      recordFamilyTestLastRequest({
        action: 'receive-media',
        sent: true,
        status: response.status,
      });
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

let diagnosticRequestSequence=0;
const diagnosticNonce=(Math.random().toString(16).slice(2)+'0000000000000000').slice(0,16);

export function createFamilyHttpTransport(deps: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  trace?: boolean;
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
      if (consumeFamilyTestNextRequestFailure(familyTestPathKind(input.method, input.path))) {
        throw new ApplicationError('NETWORK', 'The test driver armed a single request failure.');
      }
      const headers: Record<string, string> = { accept: input.expectBytes ? '*/*' : 'application/json' };
      if (input.bytes) headers['content-type'] = input.contentType || 'application/octet-stream';
      else if (input.body !== undefined) headers['content-type'] = 'application/json';
      if (input.sessionToken) headers.authorization = `Bearer ${input.sessionToken}`;
      if (input.idempotencyKey) headers['idempotency-key'] = input.idempotencyKey;
      const trace=deps.trace??(typeof __DEV__!=='undefined'&&__DEV__&&process.env.EXPO_PUBLIC_FAMILY_ALBUM_EVAL==='1');
      const metadata=(input.method.toUpperCase()==='GET'&&(input.path==='/v2/me/families'||/^\/v2\/families\/[^/]+\/(albums|album-access)$/.test(input.path)))||(input.method.toUpperCase()==='POST'&&/^\/v2\/families\/[^/]+\/albums\/[^/]+\/validate$/.test(input.path));
      const id=trace&&metadata?`diag-${diagnosticNonce}-${++diagnosticRequestSequence}`:null;
      if(id)headers['x-lampy-request-id']=id;
      const network:FamilyNetworkDiagnostic={id,engine:(fetchImpl as typeof fetch&{polyfill?:boolean}).polyfill===true?'RN':deps.fetchImpl?'INJECTED':'OTHER',rnRequested:process.env.EXPO_PUBLIC_USE_RN_FETCH==='1'||process.env.EXPO_PUBLIC_USE_RN_FETCH==='true',phase:'HEADERS',status:null};
      const controller=input.timeoutMs?new AbortController():null;
      let timer:ReturnType<typeof setTimeout>|undefined;
      const work=(async()=>{
      const response = await fetchImpl(`${baseUrl}${input.path}`, {
        method: input.method,
        headers,
        body: familyFetchBody(input),
        ...(controller ? {signal:controller.signal} : {}),
      });
      network.status=response.status;network.phase=input.expectBytes&&response.ok?'BYTES':'TEXT';
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
      })();
      if(!input.timeoutMs)return work.catch(error=>{throw familyNetworkError(error,network);});
      const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller?.abort();reject(new ApplicationError('SERVER_UNREACHABLE','Family request timed out.'));},input.timeoutMs);});
      try{return await Promise.race([work,timeout]);}catch(error){throw familyNetworkError(error,network);}finally{if(timer)clearTimeout(timer);}

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
