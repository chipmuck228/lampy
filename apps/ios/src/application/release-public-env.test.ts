import { applyClosedReleasePublicEnv, inspectReleasePublicEnv } from './release-public-env';

describe('release public env', () => {
  it('is closed in a production-like env with no public family or diagnostics flags', () => {
    expect(
      inspectReleasePublicEnv(
        {
          EXPO_PUBLIC_FAMILY_ENTRY_OPEN: '',
          EXPO_PUBLIC_FAMILY_API_BASE_URL: '',
          EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS: '0',
        },
        false,
      ),
    ).toMatchObject({
      familyEntryOpen: false,
      familyApiConfigured: false,
      diagnosticsOpen: false,
      testDriverEnabled: false,
      closed: true,
    });
  });

  it('does not treat a leftover local .env as the Release contract', () => {
    expect(
      inspectReleasePublicEnv(
        {
          EXPO_PUBLIC_FAMILY_ENTRY_OPEN: '1',
          EXPO_PUBLIC_FAMILY_API_BASE_URL: 'https://family.example.com',
          EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS: '1',
          EXPO_PUBLIC_FAMILY_TEST_DRIVER: '1',
        },
        false,
      ).closed,
    ).toBe(false);
    expect(
      inspectReleasePublicEnv(applyClosedReleasePublicEnv({ EXPO_PUBLIC_FAMILY_ENTRY_OPEN: '1' }), false).closed,
    ).toBe(true);
  });

  it('keeps diagnostics closed in Release even when __DEV__ would have shown them', () => {
    expect(inspectReleasePublicEnv({}, true).diagnosticsOpen).toBe(true);
    expect(inspectReleasePublicEnv({ EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS: '0' }, true).diagnosticsOpen).toBe(false);
    expect(inspectReleasePublicEnv({}, false).diagnosticsOpen).toBe(false);
  });
});
