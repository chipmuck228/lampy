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

export function familyTestInviteCode(value = process.env.EXPO_PUBLIC_FAMILY_TEST_INVITE_CODE) {
  if (!isFamilyTestDriverEnabled()) return '';
  return storedInviteCode || (value || '').trim();
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
