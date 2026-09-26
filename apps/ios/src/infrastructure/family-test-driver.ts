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

export function formatFamilyTestLastRequest(row = lastRequest) {
  if (!row) return null;
  const parts = [
    `测试诊断：${row.action}`,
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

let failNextRequest = false;

export function armFamilyTestNextRequestFailure() {
  if (!isFamilyTestDriverEnabled()) return;
  failNextRequest = true;
}

export function consumeFamilyTestNextRequestFailure() {
  if (!isFamilyTestDriverEnabled() || !failNextRequest) return false;
  failNextRequest = false;
  return true;
}
