'use strict';
const API = 'https://family-test.yunpura.com';
function internalProfile(env) {
  if (env.LAMPY_BUILD_PROFILE !== 'family-internal') throw new Error('Explicit family-internal profile required');
  if (!/^[1-9]\d*$/.test(env.LAMPY_BUILD_NUMBER || '')) throw new Error('LAMPY_BUILD_NUMBER must be a new positive App Store Connect build number');
  const expected = { EXPO_PUBLIC_FAMILY_INTERNAL_TEST:'1', EXPO_PUBLIC_FAMILY_ENTRY_OPEN:'1', EXPO_PUBLIC_CONTROLLED_EMAIL_ACCOUNTS:'1', EXPO_PUBLIC_FAMILY_API_BASE_URL:API, EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS:'0', EXPO_PUBLIC_FAMILY_TEST_DRIVER:'', EXPO_PUBLIC_FAMILY_TEST_INVITE_CODE:'' };
  for (const [key,value] of Object.entries(expected)) if (env[key] !== value) throw new Error(`Internal profile mismatch: ${key}`);
  return { api:API, build:env.LAMPY_BUILD_NUMBER };
}
function configure(config, env) {
  if (!env.LAMPY_BUILD_PROFILE) return config;
  const profile = internalProfile(env);
  return {...config, ios:{...config.ios, buildNumber:profile.build, infoPlist:{...config.ios.infoPlist, LampyBuildProfile:'family-internal', LampyFamilyAPI:profile.api}}};
}
module.exports={API,internalProfile,configure};
