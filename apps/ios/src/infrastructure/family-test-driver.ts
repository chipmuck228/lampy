const TEST_DRIVER_FLAG = '1';

export function isFamilyTestDriverEnabled(value = process.env.EXPO_PUBLIC_FAMILY_TEST_DRIVER) {
  return Boolean(__DEV__) && value === TEST_DRIVER_FLAG;
}

export function familyTestIdentityToken(account: 'alice' | 'bob') {
  return account === 'alice' ? 'apple_alice' : 'apple_bob';
}

let storedInviteCode = '';

export function storeFamilyTestInviteCode(code: string) {
  if (!isFamilyTestDriverEnabled()) return;
  storedInviteCode = code.trim();
}

export function clearFamilyTestInviteCode() {
  storedInviteCode = '';
}

export function familyTestInviteCode(_value = process.env.EXPO_PUBLIC_FAMILY_TEST_INVITE_CODE) {
  if (!isFamilyTestDriverEnabled()) return '';
  return storedInviteCode;
}

export function familyTestInviteSource(value = process.env.EXPO_PUBLIC_FAMILY_TEST_INVITE_CODE) {
  if (!isFamilyTestDriverEnabled()) return 'none' as const;
  if (storedInviteCode) return 'stored' as const;
  if ((value || '').trim()) return 'env' as const;
  return 'none' as const;
}

export type FamilyTestLastRequest = {
  action: string;
  sent: boolean;
  status?: number;
  errorCode?: string;
  inviteSource?: 'stored' | 'env' | 'none';
  membershipBefore?: string;
};

let lastRequest: FamilyTestLastRequest | null = null;

export function recordFamilyTestLastRequest(update: Partial<FamilyTestLastRequest> & Pick<FamilyTestLastRequest, 'action'>) {
  if (!isFamilyTestDriverEnabled()) return;
  const base: FamilyTestLastRequest =
    lastRequest && lastRequest.action === update.action
      ? lastRequest
      : { action: update.action, sent: false };
  lastRequest = {
    ...base,
    ...update,
    action: update.action,
    sent: update.sent ?? base.sent,
  };
}

export function familyTestLastRequest() {
  return lastRequest;
}

function phaseLabel(action: string) {
  if (action === 'membership' || action === 'shares') return '刷新';
  if (action === 'receive' || action === 'receive-media') return '目标收下';
  if (action === 'revoke-share') return '目标撤回';
  return '';
}

export function formatFamilyTestLastRequest(row = lastRequest) {
  if (!row) return null;
  const parts = [
    `测试诊断：${row.action}`,
    phaseLabel(row.action),
    row.sent ? '已发出' : '未发出',
    row.status != null ? `HTTP ${row.status}` : '无HTTP',
    row.errorCode || '无错误码',
    row.inviteSource ? `邀请来源 ${row.inviteSource}` : '',
    row.membershipBefore ? `加入前 ${row.membershipBefore}` : '',
  ].filter(Boolean);
  return parts.join(' ');
}

export function clearFamilyTestLastRequest() {
  lastRequest = null;
}

export type FamilyTestFailTarget = 'refresh' | 'receive' | 'receive-media' | 'revoke';

let failNextTarget: FamilyTestFailTarget | null = null;

export function armFamilyTestNextRequestFailure(target: FamilyTestFailTarget = 'revoke') {
  if (!isFamilyTestDriverEnabled()) return;
  failNextTarget = target;
}

function failTargetMatches(target: FamilyTestFailTarget, kind: string) {
  if (target === 'refresh') return kind === 'shares' || kind === 'membership';
  if (target === 'receive') return kind === 'receive';
  if (target === 'receive-media') return kind === 'receive-media';
  if (target === 'revoke') return kind === 'revoke-share';
  return false;
}

export function consumeFamilyTestNextRequestFailure(kind?: string) {
  if (!isFamilyTestDriverEnabled() || !failNextTarget) return false;
  if (kind === undefined) {
    failNextTarget = null;
    return true;
  }
  if (!failTargetMatches(failNextTarget, kind)) return false;
  failNextTarget = null;
  return true;
}

export function familyTestArmedFailure() {
  return failNextTarget;
}

export type FamilyTestLibraryPick = {
  sourceUri: string;
  mimeType: string;
  width: number;
  height: number;
};

let pendingLibraryPick: FamilyTestLibraryPick | null = null;

export function armFamilyTestLibraryPick(pick: FamilyTestLibraryPick) {
  if (!isFamilyTestDriverEnabled()) return;
  pendingLibraryPick = pick;
}

export function consumeFamilyTestLibraryPick() {
  if (!isFamilyTestDriverEnabled() || !pendingLibraryPick) return null;
  const pick = pendingLibraryPick;
  pendingLibraryPick = null;
  return pick;
}

export const FAMILY_TEST_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAEKADAAQAAAABAAAAEAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAEAAQAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A4+iiivgz8XP/2Q==';
