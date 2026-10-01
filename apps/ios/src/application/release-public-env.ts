import { isPersonalSettingsDiagnosticsOpen } from './personal-settings-visibility';
import {
  familyApiBaseUrl,
  isFamilyApiConfigured,
  isFamilyProductEntryOpen,
} from '../infrastructure/family-config';
import { isFamilyTestDriverEnabled } from '../infrastructure/family-test-driver';

/** Public flags that must be closed in a TestFlight / Release archive. */
export type ReleasePublicEnvReport = {
  familyEntryOpen: boolean;
  familyApiConfigured: boolean;
  familyApiBaseUrl: string;
  diagnosticsOpen: boolean;
  testDriverEnabled: boolean;
  closed: boolean;
};

/**
 * Inspect the env that will be inlined into a JS bundle.
 * Pass `isDev=false` for Release; do not infer from a leftover local `.env`.
 */
export function inspectReleasePublicEnv(
  env: Record<string, string | undefined> = process.env,
  isDev = false,
): ReleasePublicEnvReport {
  const familyEntryOpen = isFamilyProductEntryOpen(env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN);
  const familyApiConfigured = isFamilyApiConfigured(env.EXPO_PUBLIC_FAMILY_API_BASE_URL);
  const diagnosticsOpen = isPersonalSettingsDiagnosticsOpen(env, isDev);
  const testDriverEnabled = Boolean(isDev) && isFamilyTestDriverEnabled(env.EXPO_PUBLIC_FAMILY_TEST_DRIVER);
  return {
    familyEntryOpen,
    familyApiConfigured,
    familyApiBaseUrl: familyApiBaseUrl(env.EXPO_PUBLIC_FAMILY_API_BASE_URL),
    diagnosticsOpen,
    testDriverEnabled,
    closed: !familyEntryOpen && !familyApiConfigured && !diagnosticsOpen && !testDriverEnabled,
  };
}

export function applyClosedReleasePublicEnv(
  env: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    ...env,
    EXPO_PUBLIC_FAMILY_ENTRY_OPEN: '',
    EXPO_PUBLIC_FAMILY_API_BASE_URL: '',
    EXPO_PUBLIC_FAMILY_TEST_DRIVER: '',
    EXPO_PUBLIC_FAMILY_TEST_INVITE_CODE: '',
    EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS: '0',
  };
}
