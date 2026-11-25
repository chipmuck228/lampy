'use strict';
function configureAndroidPersonal(config, env) {
  if(!['android-personal','android-preview'].includes(env.LAMPY_BUILD_PROFILE)) return config;
  if(env.LAMPY_BUILD_PROFILE==='android-preview') {
    for(const key of ['EXPO_PUBLIC_UNIFIED_PURCHASES','EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED','EXPO_PUBLIC_ALBUM_EXPORT_ENABLED','EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED','EXPO_PUBLIC_ALBUM_PRINT_EVAL'])if(env[key]!=='0')throw Error('Android preview requires closed payments/exports: '+key);
    if(env.EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID)throw Error('Android must not configure a purchase product');
  }
  const code = env.LAMPY_ANDROID_VERSION_CODE || '1';
  if(!/^[1-9]\d*$/.test(code) || Number(code)>2100000000) throw new Error('Invalid Android versionCode');
  return {...config, android:{...config.android, versionCode:Number(code),
    softwareKeyboardLayoutMode:'resize', allowBackup:false,
    adaptiveIcon:{...config.android?.adaptiveIcon, foregroundImage:'./assets/images/splash-icon.png'},
    blockedPermissions:[...new Set([...(config.android?.blockedPermissions || []),
      'com.android.vending.BILLING','android.permission.READ_MEDIA_AUDIO','android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_IMAGES','android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE'])],
  }};
}
module.exports = {configureAndroidPersonal};
