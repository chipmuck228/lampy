'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {personalEnv} = require('./android-personal.cjs');
const {configureAndroidPersonal} = require('./android-personal-profile.cjs');
test('Android commands override inherited release, family and purchase flags',()=>{
  const env=personalEnv({LAMPY_BUILD_PROFILE:'appstore-v1',EXPO_PUBLIC_FAMILY_ENTRY_OPEN:'1',EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED:'1',EXPO_PUBLIC_FAMILY_API_BASE_URL:'https://family.yunpura.com'});
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
