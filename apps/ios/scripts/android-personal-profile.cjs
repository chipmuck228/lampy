'use strict';
function configureAndroidPersonal(config, env) {
  if(env.LAMPY_BUILD_PROFILE !== 'android-personal') return config;
  const code = env.LAMPY_ANDROID_VERSION_CODE || '1';
  if(!/^[1-9]\d*$/.test(code) || Number(code)>2100000000) throw new Error('Invalid Android versionCode');
  return {...config, android:{...config.android, versionCode:Number(code),
    softwareKeyboardLayoutMode:'resize', allowBackup:false,
    adaptiveIcon:{...config.android?.adaptiveIcon, foregroundImage:'./assets/images/splash-icon.png'},
    blockedPermissions:[...new Set([...(config.android?.blockedPermissions || []),
      'android.permission.READ_MEDIA_AUDIO','android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_IMAGES','android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE'])],
  }};
}
module.exports = {configureAndroidPersonal};
