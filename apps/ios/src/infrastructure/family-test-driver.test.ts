import {
  armFamilyTestNextRequestFailure,
  clearFamilyTestInviteCode,
  clearFamilyTestLastRequest,
  consumeFamilyTestNextRequestFailure,
  familyTestIdentityToken,
  familyTestInviteCode,
  familyTestInviteSource,
  formatFamilyTestLastRequest,
  isFamilyTestDriverEnabled,
  recordFamilyTestLastRequest,
  storeFamilyTestInviteCode,
} from './family-test-driver';

describe('family test driver', () => {
  const previous = process.env.EXPO_PUBLIC_FAMILY_TEST_DRIVER;

  afterEach(() => {
    process.env.EXPO_PUBLIC_FAMILY_TEST_DRIVER = '1';
    consumeFamilyTestNextRequestFailure();
    clearFamilyTestInviteCode();
    clearFamilyTestLastRequest();
    if (previous === undefined) delete process.env.EXPO_PUBLIC_FAMILY_TEST_DRIVER;
    else process.env.EXPO_PUBLIC_FAMILY_TEST_DRIVER = previous;
  });

  it('stays off unless the explicit test-build flag is set', () => {
    delete process.env.EXPO_PUBLIC_FAMILY_TEST_DRIVER;
    expect(isFamilyTestDriverEnabled()).toBe(false);
    expect(isFamilyTestDriverEnabled('')).toBe(false);
    expect(isFamilyTestDriverEnabled('true')).toBe(false);
    expect(isFamilyTestDriverEnabled('1')).toBe(true);
  });

  it('only consumes an armed failure for the targeted family request', () => {
    process.env.EXPO_PUBLIC_FAMILY_TEST_DRIVER = '1';
    armFamilyTestNextRequestFailure('receive');
    expect(consumeFamilyTestNextRequestFailure('membership')).toBe(false);
    expect(consumeFamilyTestNextRequestFailure('shares')).toBe(false);
    expect(consumeFamilyTestNextRequestFailure('receive')).toBe(true);
    expect(consumeFamilyTestNextRequestFailure('receive')).toBe(false);
    armFamilyTestNextRequestFailure('revoke');
    expect(consumeFamilyTestNextRequestFailure('shares')).toBe(false);
    expect(consumeFamilyTestNextRequestFailure('revoke-share')).toBe(true);
    armFamilyTestNextRequestFailure('receive-media');
    expect(consumeFamilyTestNextRequestFailure('receive')).toBe(false);
    expect(consumeFamilyTestNextRequestFailure('receive-media')).toBe(true);
    armFamilyTestNextRequestFailure('refresh');
    expect(consumeFamilyTestNextRequestFailure('receive')).toBe(false);
    expect(consumeFamilyTestNextRequestFailure('shares')).toBe(true);
  });

  it('only maps the local test tokens and arms a single request failure', () => {
    process.env.EXPO_PUBLIC_FAMILY_TEST_DRIVER = '1';
    expect(familyTestIdentityToken('alice')).toBe('apple_alice');
    expect(familyTestIdentityToken('bob')).toBe('apple_bob');
    expect(familyTestInviteCode('336dec6f90ed4d56927a325198ad0384')).toBe('');
    expect(familyTestInviteCode('')).toBe('');
    storeFamilyTestInviteCode('live-invite-from-creator');
    expect(familyTestInviteCode('env-fallback')).toBe('live-invite-from-creator');
    expect(consumeFamilyTestNextRequestFailure()).toBe(false);
    armFamilyTestNextRequestFailure();
    expect(consumeFamilyTestNextRequestFailure()).toBe(true);
    expect(consumeFamilyTestNextRequestFailure()).toBe(false);
  });

  it('reports a safe last-request snapshot without invite or session values', () => {
    process.env.EXPO_PUBLIC_FAMILY_TEST_DRIVER = '1';
    expect(familyTestInviteSource('')).toBe('none');
    expect(familyTestInviteSource('env-code')).toBe('env');
    storeFamilyTestInviteCode('live-invite-from-creator');
    expect(familyTestInviteSource('env-code')).toBe('stored');
    recordFamilyTestLastRequest({
      action: 'accept',
      sent: true,
      status: 409,
      errorCode: 'ALREADY_IN_FAMILY',
      inviteSource: 'stored',
      membershipBefore: 'none',
    });
    expect(formatFamilyTestLastRequest()).toBe(
      '测试诊断：accept 已发出 HTTP 409 ALREADY_IN_FAMILY 邀请来源 stored 加入前 none',
    );
    recordFamilyTestLastRequest({
      action: 'receive',
      sent: false,
      errorCode: 'NETWORK',
    });
    expect(formatFamilyTestLastRequest()).toBe('测试诊断：receive 目标收下 未发出 无HTTP NETWORK');
    recordFamilyTestLastRequest({
      action: 'shares',
      sent: false,
      errorCode: 'NETWORK',
    });
    expect(formatFamilyTestLastRequest()).toBe('测试诊断：shares 刷新 未发出 无HTTP NETWORK');
  });

  it('does not arm failures when the test driver is off', () => {
    delete process.env.EXPO_PUBLIC_FAMILY_TEST_DRIVER;
    armFamilyTestNextRequestFailure();
    expect(consumeFamilyTestNextRequestFailure()).toBe(false);
    expect(familyTestInviteCode('336dec6f90ed4d56927a325198ad0384')).toBe('');
  });
});
