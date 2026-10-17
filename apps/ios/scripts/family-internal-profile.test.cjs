'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {configure,internalProfile}=require('./family-internal-profile.cjs');
const env={EXPO_PUBLIC_FAMILY_ALBUM_EVAL:'1',EXPO_PUBLIC_UNIFIED_PURCHASES:'0',EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED:'0',EXPO_PUBLIC_ALBUM_EXPORT_ENABLED:'0',EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED:'0',EXPO_PUBLIC_ALBUM_PRINT_EVAL:'0',LAMPY_BUILD_PROFILE:'family-internal',LAMPY_BUILD_NUMBER:'8',EXPO_PUBLIC_FAMILY_INTERNAL_TEST:'1',EXPO_PUBLIC_FAMILY_ENTRY_OPEN:'1',EXPO_PUBLIC_CONTROLLED_EMAIL_ACCOUNTS:'1',EXPO_PUBLIC_FAMILY_API_BASE_URL:'https://family-test.yunpura.com',EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS:'0',EXPO_PUBLIC_FAMILY_TEST_DRIVER:'',EXPO_PUBLIC_FAMILY_TEST_INVITE_CODE:''};
test('personal config unchanged',()=>{const base={ios:{buildNumber:'1'}};assert.equal(configure(base,{...env,LAMPY_BUILD_PROFILE:undefined}),base);});
test('internal build preserves permissions and base config',()=>{const base={ios:{buildNumber:'1',infoPlist:{NSMicrophoneUsageDescription:'Keep'}}};const c=configure(base,env);assert.equal(c.ios.buildNumber,'8');assert.equal(c.ios.infoPlist.LampyFamilyAPI,env.EXPO_PUBLIC_FAMILY_API_BASE_URL);assert.equal(c.ios.infoPlist.NSMicrophoneUsageDescription,'Keep');assert.equal(base.ios.buildNumber,'1');});
test('bad origin, diagnostics, driver, missing build or unknown profile fails',()=>{for(const patch of [{EXPO_PUBLIC_FAMILY_API_BASE_URL:'http://localhost:8787'},{EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS:'1'},{EXPO_PUBLIC_FAMILY_TEST_DRIVER:'1'},{LAMPY_BUILD_NUMBER:''},{LAMPY_BUILD_PROFILE:'typo'}])assert.throws(()=>internalProfile({...env,...patch}));});

test('internal preview rejects every paid/export switch and a missing preview flag',()=>{
 for(const key of ['EXPO_PUBLIC_UNIFIED_PURCHASES','EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED','EXPO_PUBLIC_ALBUM_EXPORT_ENABLED','EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED','EXPO_PUBLIC_ALBUM_PRINT_EVAL']) assert.throws(()=>internalProfile({...env,[key]:'1'}));
 assert.throws(()=>internalProfile({...env,EXPO_PUBLIC_FAMILY_ALBUM_EVAL:'0'}));
 assert.equal(configure({ios:{}},env).ios.infoPlist.LampyFamilyAlbumPreviewEnabled,true);
});

test('archive shell closes inherited exports and restores only internal family preview',()=>{
 const {execFileSync}=require('node:child_process');
 const path=require('node:path');
 const result=execFileSync('bash',['-c',`source scripts/release-public-env.sh; source scripts/family-internal-env.sh; node -e 'require("./scripts/family-internal-profile.cjs").internalProfile(process.env); console.log(process.env.EXPO_PUBLIC_FAMILY_ALBUM_EVAL)'`],{
  cwd:path.join(__dirname,'..'),encoding:'utf8',env:{...process.env,LAMPY_BUILD_NUMBER:'99',EXPO_PUBLIC_UNIFIED_PURCHASES:'1',EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED:'1',EXPO_PUBLIC_ALBUM_EXPORT_ENABLED:'1',EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED:'1',EXPO_PUBLIC_ALBUM_PRINT_EVAL:'1'}
 });
 assert.equal(result.trim(),'1');
});

test('manual Xcode process receives closed switches without inheriting preparation shell',()=>{
 const {execFileSync}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lampy-xcode-env-'));const output=path.join(dir,'.xcode.env.local');const cwd=path.join(__dirname,'..');
 try {
  execFileSync('bash',['-c','source scripts/release-public-env.sh; source scripts/family-internal-env.sh; bash scripts/write-family-xcode-env.sh "$1"','prepare',output],{cwd,env:{...process.env,LAMPY_BUILD_NUMBER:'99'}});
  const clean={PATH:process.env.PATH,HOME:process.env.HOME};
  const result=execFileSync('bash',['-c',`source "$1"; "$NODE_BINARY" -e 'require("./scripts/family-internal-profile.cjs").internalProfile(process.env); console.log(process.env.EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID === "" ? "closed" : "open")'`,'xcode',output],{cwd,env:clean,encoding:'utf8'});
  assert.equal(result.trim(),'closed');
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
