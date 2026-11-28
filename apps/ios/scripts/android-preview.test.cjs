const {test}=require('node:test'),assert=require('node:assert/strict');
const {previewEnv}=require('./android-preview.cjs');
const configure=require('../app.config.cjs');
test('Android parity opens family and matching email login but closes every purchase/export switch despite inherited iOS flags',()=>{
 const env=previewEnv({LAMPY_BUILD_PROFILE:'appstore-launch',EXPO_PUBLIC_UNIFIED_PURCHASES:'1',EXPO_PUBLIC_ALBUM_EXPORT_ENABLED:'1',EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED:'1',EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED:'1',EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID:'lampyepubexport'});
 assert.equal(env.EXPO_PUBLIC_FAMILY_API_BASE_URL,'https://lampy-api.5sparks.ai');assert.equal(env.EXPO_PUBLIC_ANDROID_FAMILY_ENABLED,'1');assert.equal(env.EXPO_PUBLIC_FAMILY_ALBUM_EVAL,'1');assert.equal(env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN,'1');assert.equal(env.EXPO_PUBLIC_FAMILY_API_BASE_URL,env.EXPO_PUBLIC_ACCOUNT_API_BASE_URL);
 for(const key of ['EXPO_PUBLIC_UNIFIED_PURCHASES','EXPO_PUBLIC_ALBUM_EXPORT_ENABLED','EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED','EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED','EXPO_PUBLIC_ALBUM_PRINT_EVAL'])assert.equal(env[key],'0');
 assert.equal(env.EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID,'');assert.equal(env.EXPO_NO_DOTENV,'1');
});
test('profile rejects untested credential destinations and invalid version codes',()=>{
 for(const url of ['http://public.example','https://family-test.yunpura.com','https://lampy-family-api.5sparks.ai','https://lampy-family-staging.onrender.com','https://lampy-api.5sparks.ai.evil.test'])assert.throws(()=>previewEnv({LAMPY_ANDROID_FAMILY_API_BASE_URL:url}));
 const {configureAndroidPersonal}=require('./android-personal-profile.cjs');
 const env=previewEnv({LAMPY_ANDROID_VERSION_CODE:'5'});const ios={bundleIdentifier:'app.lampy.ios'};const result=configureAndroidPersonal({ios},env);
 assert.equal(result.ios,ios);assert.equal(result.android.versionCode,5);assert.equal(result.android.allowBackup,false);assert.ok(result.android.blockedPermissions.includes('com.android.vending.BILLING'));
 assert.throws(()=>configureAndroidPersonal({}, {...env,EXPO_PUBLIC_UNIFIED_PURCHASES:'1'}));
 assert.equal(typeof configure,'function');
});
