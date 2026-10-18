'use strict';
const API = 'https://family.yunpura.com';
const FLAGS = {
  EXPO_PUBLIC_APPSTORE_V1: '1',
  EXPO_PUBLIC_FAMILY_INTERNAL_TEST: '0',
  EXPO_PUBLIC_FAMILY_ENTRY_OPEN: '1',
  EXPO_PUBLIC_FAMILY_ALBUM_EVAL: '1',
  EXPO_PUBLIC_FAMILY_API_BASE_URL: API,
  EXPO_PUBLIC_CONTROLLED_EMAIL_ACCOUNTS: '0',
  EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS: '0',
  EXPO_PUBLIC_FAMILY_TEST_DRIVER: '',
  EXPO_PUBLIC_FAMILY_TEST_INVITE_CODE: '',
  EXPO_PUBLIC_UNIFIED_PURCHASES: '0',
  EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED: '0',
  EXPO_PUBLIC_ALBUM_EXPORT_ENABLED: '0',
  EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED: '0',
  EXPO_PUBLIC_ALBUM_PRINT_EVAL: '0',
  EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID: '',
  EXPO_NO_DOTENV: '1',
};
function appstoreV1Profile(env) {
  if (env.LAMPY_BUILD_PROFILE !== 'appstore-v1') throw new Error('Expected appstore-v1 profile');
  if (!/^[1-9]\d*$/.test(env.LAMPY_BUILD_NUMBER || '')) throw new Error('Positive build number required');
  for (const [key, value] of Object.entries(FLAGS)) {
    if (env[key] !== value) throw new Error(`App Store 1.0.0 requires ${key}=${value}`);
  }
  return {api: API, build: env.LAMPY_BUILD_NUMBER, version: '1.0.0'};
}
function configureAppstoreV1(config, env) {
  const profile = appstoreV1Profile(env);
  return {...config, version: profile.version, ios: {...config.ios,
    buildNumber: profile.build,
    associatedDomains: [...new Set([...(config.ios?.associatedDomains || []), 'applinks:family.yunpura.com'])],
    infoPlist: {...config.ios?.infoPlist, LampyBuildProfile: 'appstore-v1',
      LampyFamilyAPI: profile.api, LampyFamilyAlbumPreviewEnabled: true,
      LampyEmailLoginEnabled: false}}};
}
module.exports = {API, FLAGS, appstoreV1Profile, configureAppstoreV1};
