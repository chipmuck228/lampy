'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {FLAGS,appstoreV1Profile}=require('./appstore-v1-profile.cjs');
const {configure}=require('./family-internal-profile.cjs');const {configureAlbumExport}=require('./album-export-profile.cjs');
const env={...FLAGS,LAMPY_BUILD_PROFILE:'appstore-v1',LAMPY_BUILD_NUMBER:'11'};
test('v1 preserves permissions and closes native purchases',()=>{
 const base={ios:{infoPlist:{NSMicrophoneUsageDescription:'Keep'}}};const result=configureAlbumExport(configure(base,env),env);
 assert.equal(result.version,'1.0.0');assert.equal(result.ios.buildNumber,'11');assert.equal(base.version,undefined);
 for(const [key,value] of Object.entries({NSMicrophoneUsageDescription:'Keep',LampyFamilyAlbumPreviewEnabled:true,LampyEmailLoginEnabled:false,LampyPaidExportEnabled:false,LampyUnifiedPurchasesEnabled:false,LampyExportProductID:''}))assert.equal(result.ios.infoPlist[key],value);
 assert.ok(result.ios.associatedDomains.includes('applinks:family.yunpura.com'));
});
test('unexpected and missing flags fail closed',()=>{
 for(const [key,value] of Object.entries(FLAGS)){
  assert.throws(()=>appstoreV1Profile({...env,[key]:undefined}),key);
  assert.throws(()=>appstoreV1Profile({...env,[key]:value==='1'?'0':'1'}),key);
 }
 for(const build of ['','0','-1','1.1','abc'])assert.throws(()=>appstoreV1Profile({...env,LAMPY_BUILD_NUMBER:build}));
});
test('independent Xcode shell retains formal profile and closes inherited flags',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lampy-v1-'));const output=path.join(dir,'.xcode.env.local');const cwd=path.join(__dirname,'..');
 try{
 execFileSync('bash',['-c','source scripts/release-public-env.sh; source scripts/appstore-v1-env.sh; bash scripts/write-family-xcode-env.sh "$1"','prepare',output],{cwd,env:{...process.env,LAMPY_BUILD_NUMBER:'11',EXPO_PUBLIC_FAMILY_INTERNAL_TEST:'1',EXPO_PUBLIC_CONTROLLED_EMAIL_ACCOUNTS:'1',EXPO_PUBLIC_UNIFIED_PURCHASES:'1',EXPO_PUBLIC_ALBUM_EXPORT_ENABLED:'1',EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID:'old'}});
 const result=execFileSync('bash',['-c',`source "$1"; "$NODE_BINARY" -e 'console.log(require("./scripts/appstore-v1-profile.cjs").appstoreV1Profile(process.env).version)'`,'xcode',output],{cwd,env:{PATH:process.env.PATH,HOME:process.env.HOME},encoding:'utf8'});
 assert.equal(result.trim(),'1.0.0');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
