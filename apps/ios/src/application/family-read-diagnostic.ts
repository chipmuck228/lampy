// Temporary release-build troubleshooting. Fixed fields only; no IDs, URLs,
// credentials, server descriptions or record/media contents enter this log.
export type FamilyReadStage = 'DETAIL' | 'MEDIA_METADATA' | 'CACHE' | 'MEDIA_CONTENT' | 'FINAL_AUTHORIZATION' | 'PUBLISH';
const codes = new Set(['FORBIDDEN','SHARE_NOT_FOUND','NOT_IN_FAMILY','UNAUTHENTICATED','FAMILY_DISSOLVED','FAMILY_HISTORY_CLOSED','FAMILY_READ_LEASE_EXPIRED','NETWORK','SERVER_UNREACHABLE','RATE_LIMITED','SHARE_MEDIA_UNAVAILABLE','STALE_FAMILY_REQUEST']);
export function familyReadDiagnostic(event: 'START' | 'READY' | 'READ_FAILED' | 'LIST_LOAD_FAILED' | 'DETAIL_LOAD_FAILED' | 'LIST_RENEW_FAILED' | 'DETAIL_RENEW_FAILED', stage: FamilyReadStage, started: number, failure?: unknown, mediaNumber?: number) {
  const value = failure && typeof failure === 'object' ? failure as {code?:unknown;httpStatus?:unknown} : {};
  const code = typeof value.code === 'string' && codes.has(value.code) ? value.code : failure ? 'OTHER' : undefined;
  const status = typeof value.httpStatus === 'number' && Number.isInteger(value.httpStatus) && value.httpStatus >= 0 && value.httpStatus <= 599 ? value.httpStatus : undefined;
  const row = {revision:'photo-read-3',event,stage,elapsedMs:Math.max(0,Math.round(Date.now()-started)),...(code?{code}:{}),...(status!==undefined?{httpStatus:status}:{}),...(mediaNumber&&Number.isInteger(mediaNumber)&&mediaNumber<=4?{mediaNumber}:{})};
  console.info('[LampyFamilyRead]',JSON.stringify(row));
}
