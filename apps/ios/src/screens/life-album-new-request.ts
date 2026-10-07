/** Page-local request generation for create / create+collect. */

export function shouldApplyAlbumNewRequest(input: {
  requestId: number;
  currentRequestId: number;
}): boolean {
  return input.requestId === input.currentRequestId;
}

export function albumNewSourceKey(input: {
  intentToken?: string | string[] | undefined;
  momentParam?: string | string[] | undefined;
}): string {
  const token = Array.isArray(input.intentToken)
    ? input.intentToken[0]
    : input.intentToken;
  const moment = Array.isArray(input.momentParam)
    ? input.momentParam[0]
    : input.momentParam;
  return `${(token ?? '').trim()}:${(moment ?? '').trim()}`;
}
