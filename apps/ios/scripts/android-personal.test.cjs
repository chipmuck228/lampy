'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {personalEnv} = require('./android-personal.cjs');
const {configureAndroidPersonal} = require('./android-personal-profile.cjs');
test('Android commands override inherited release, family and purchase flags',()=>{
  const env=personalEnv({LAMPY_BUILD_PROFILE:'appstore-v1',EXPO_PUBLIC_FAMILY_ENTRY_OPEN:'1',EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED:'1',EXPO_PUBLIC_FAMILY_API_BASE_URL:'https://lampy-family-api.5sparks.ai'});
  assert.equal(env.LAMPY_BUILD_PROFILE,'android-personal');
  assert.equal(env.EXPO_NO_DOTENV,'1');
  assert.equal(env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN,'0');
  assert.equal(env.EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED,'0');
  assert.equal(env.EXPO_PUBLIC_FAMILY_API_BASE_URL,'');
});
test('Android config disables backup and broad storage access without changing iOS',()=>{
 const config={ios:{bundleIdentifier:'app.lampy.ios'},android:{package:'app.lampy.android'}};
 assert.equal(configureAndroidPersonal(config,{}),config);
 const result=configureAndroidPersonal(config,personalEnv({LAMPY_ANDROID_VERSION_CODE:'2'}));
 assert.equal(result.ios,config.ios);
 assert.equal(result.android.allowBackup,false);
 assert.equal(result.android.versionCode,2);
 assert.ok(result.android.blockedPermissions.includes('android.permission.READ_MEDIA_IMAGES'));
 assert.throws(()=>configureAndroidPersonal(config,personalEnv({LAMPY_ANDROID_VERSION_CODE:'0'})));
});

test('optional email authentication does not open Android family or purchases',()=>{
 const result=personalEnv({EXPO_PUBLIC_EMAIL_CODE_LOGIN_ENABLED:'1',EXPO_PUBLIC_ACCOUNT_API_BASE_URL:'https://accounts.example.com',EXPO_PUBLIC_FAMILY_ENTRY_OPEN:'1'});
 assert.equal(result.EXPO_PUBLIC_EMAIL_CODE_LOGIN_ENABLED,'1');assert.equal(result.EXPO_PUBLIC_ACCOUNT_API_BASE_URL,'https://accounts.example.com');assert.equal(result.EXPO_PUBLIC_FAMILY_ENTRY_OPEN,'0');assert.equal(result.EXPO_PUBLIC_FAMILY_API_BASE_URL,'');assert.equal(result.EXPO_PUBLIC_UNIFIED_PURCHASES,'0');
 const closed=personalEnv({EXPO_PUBLIC_EMAIL_CODE_LOGIN_ENABLED:'0',EXPO_PUBLIC_ACCOUNT_API_BASE_URL:'https://leftover.example.com'});assert.equal(closed.EXPO_PUBLIC_ACCOUNT_API_BASE_URL,'');
});
