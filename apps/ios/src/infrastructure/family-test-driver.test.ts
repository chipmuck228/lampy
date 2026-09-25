import {
  armFamilyTestNextRequestFailure,
  clearFamilyTestInviteCode,
  consumeFamilyTestNextRequestFailure,
  familyTestIdentityToken,
  familyTestInviteCode,
  isFamilyTestDriverEnabled,
  storeFamilyTestInviteCode,
} from './family-test-driver';

describe('family test driver', () => {
  const previous = process.env.EXPO_PUBLIC_FAMILY_TEST_DRIVER;

  afterEach(() => {
    process.env.EXPO_PUBLIC_FAMILY_TEST_DRIVER = '1';
    consumeFamilyTestNextRequestFailure();
    clearFamilyTestInviteCode();
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

  it('only maps the local test tokens and arms a single request failure', () => {
    process.env.EXPO_PUBLIC_FAMILY_TEST_DRIVER = '1';
    expect(familyTestIdentityToken('alice')).toBe('apple_alice');
    expect(familyTestIdentityToken('bob')).toBe('apple_bob');
    expect(familyTestInviteCode('336dec6f90ed4d56927a325198ad0384')).toBe(
      '336dec6f90ed4d56927a325198ad0384',
    );
    expect(familyTestInviteCode('')).toBe('');
    storeFamilyTestInviteCode('live-invite-from-creator');
    expect(familyTestInviteCode('env-fallback')).toBe('live-invite-from-creator');
    expect(consumeFamilyTestNextRequestFailure()).toBe(false);
    armFamilyTestNextRequestFailure();
    expect(consumeFamilyTestNextRequestFailure()).toBe(true);
    expect(consumeFamilyTestNextRequestFailure()).toBe(false);
  });

  it('does not arm failures when the test driver is off', () => {
    delete process.env.EXPO_PUBLIC_FAMILY_TEST_DRIVER;
    armFamilyTestNextRequestFailure();
    expect(consumeFamilyTestNextRequestFailure()).toBe(false);
    expect(familyTestInviteCode('336dec6f90ed4d56927a325198ad0384')).toBe('');
  });
});
