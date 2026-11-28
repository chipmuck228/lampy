/* global __dirname */
'use strict';
const {spawnSync}=require('node:child_process');
const {personalEnv}=require('./android-personal.cjs');
function previewEnv(env=process.env){
 const base=(env.LAMPY_ANDROID_FAMILY_API_BASE_URL||'https://lampy-api.5sparks.ai').trim().replace(/\/+$/,'');
 // This is the configured family/account backend; no arbitrary or plaintext credential destination.
 if(base!=='https://lampy-api.5sparks.ai')throw Error('Android preview currently requires the Lampy custom HTTPS endpoint');
 return {...personalEnv(env),LAMPY_BUILD_PROFILE:'android-preview',
  EXPO_PUBLIC_ANDROID_FAMILY_ENABLED:'1',EXPO_PUBLIC_FAMILY_ENTRY_OPEN:'1',
  EXPO_PUBLIC_FAMILY_API_BASE_URL:base,EXPO_PUBLIC_FAMILY_INTERNAL_TEST:'1',
  EXPO_PUBLIC_CONTROLLED_EMAIL_ACCOUNTS:'1',EXPO_PUBLIC_FAMILY_ALBUM_EVAL:'1',
  EXPO_PUBLIC_EMAIL_CODE_LOGIN_ENABLED:'1',EXPO_PUBLIC_ACCOUNT_API_BASE_URL:base};
}
module.exports={previewEnv};
if(require.main===module){
 const commands={config:['config','--type','public'],prebuild:['prebuild','--platform','android','--no-install'],run:['run:android'],release:['run:android','--variant','release'],bundle:['export','--platform','android'],start:['start','--dev-client']};
 if(process.argv[2]==='apk'){
  const path=require('node:path'),root=path.resolve(__dirname,'..');
  const result=spawnSync(path.join(root,'android','gradlew'),[':app:assembleRelease','-PreactNativeArchitectures=arm64-v8a','--no-daemon','--max-workers=2'],{stdio:'inherit',cwd:path.join(root,'android'),env:previewEnv()});if(result.error)throw result.error;process.exit(result.status??1);
 }
 const args=commands[process.argv[2]];if(!args)throw Error('Expected config, prebuild, run, release, bundle or start');
 const result=spawnSync(process.execPath,[require.resolve('expo/bin/cli'),...args],{stdio:'inherit',env:previewEnv(),cwd:require('node:path').resolve(__dirname,'..')});if(result.error)throw result.error;process.exitCode=result.status??1;
}
