'use strict';
const { spawnSync } = require('node:child_process');
const CLOSED = {
  EXPO_NO_DOTENV:'1', EXPO_PUBLIC_ANDROID_FAMILY_ENABLED:'0', EXPO_PUBLIC_APPSTORE_V1:'0', EXPO_PUBLIC_FAMILY_INTERNAL_TEST:'0',
  EXPO_PUBLIC_FAMILY_ENTRY_OPEN:'0', EXPO_PUBLIC_FAMILY_API_BASE_URL:'',
  EXPO_PUBLIC_CONTROLLED_EMAIL_ACCOUNTS:'0', EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS:'0',
  EXPO_PUBLIC_FAMILY_TEST_DRIVER:'', EXPO_PUBLIC_FAMILY_TEST_INVITE_CODE:'',
  EXPO_PUBLIC_FAMILY_ALBUM_EVAL:'0', EXPO_PUBLIC_UNIFIED_PURCHASES:'0',
  EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED:'0', EXPO_PUBLIC_ALBUM_EXPORT_ENABLED:'0',
  EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED:'0', EXPO_PUBLIC_ALBUM_PRINT_EVAL:'0',
  EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID:'',
};
function personalEnv(env = process.env) {
  const email=env.EXPO_PUBLIC_EMAIL_CODE_LOGIN_ENABLED==='1';
  return {...env, ...CLOSED, EXPO_PUBLIC_EMAIL_CODE_LOGIN_ENABLED:email?'1':'0',EXPO_PUBLIC_ACCOUNT_API_BASE_URL:email?(env.EXPO_PUBLIC_ACCOUNT_API_BASE_URL||''):'',LAMPY_BUILD_PROFILE:'android-personal'};
}
const COMMANDS = {
  config:['config','--type','public'],
  prebuild:['prebuild','--platform','android','--no-install'],
  run:['run:android'],
  release:['run:android','--variant','release'],
  bundle:['export','--platform','android'],
  start:['start','--dev-client'],
};
module.exports = {personalEnv};
if(require.main === module) {
  const args = COMMANDS[process.argv[2]];
  if(!args) throw new Error('Expected config, prebuild, run, release, bundle or start');
  const cli = require.resolve('expo/bin/cli');
  const result = spawnSync(process.execPath,[cli,...args],{stdio:'inherit',env:personalEnv(),cwd:require('node:path').resolve(__dirname,'..')});
  if(result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
