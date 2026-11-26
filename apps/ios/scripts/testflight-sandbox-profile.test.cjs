'use strict';
const {test}=require('node:test'); const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {FLAGS,launchProfile}=require('./testflight-sandbox-profile.cjs');
const {configure}=require('./family-internal-profile.cjs');const {configureAlbumExport}=require('./album-export-profile.cjs');
const env={...FLAGS,LAMPY_BUILD_PROFILE:'testflight-sandbox',LAMPY_BUILD_NUMBER:'17',LAMPY_RELEASE_PRODUCT_ID:'lampyepubexport',EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID:'lampyepubexport'};
test('sandbox archive matches accepted features without altering base config',()=>{
 const base=require('../app.json').expo;const before=JSON.stringify(base);const result=configureAlbumExport(configure(base,env),env);
 assert.equal(JSON.stringify(base),before);assert.equal(result.version,'1.0.0');assert.equal(result.ios.buildNumber,'17');
 assert.equal(result.ios.infoPlist.LampyBuildProfile,'testflight-sandbox');assert.equal(result.ios.infoPlist.LampyFamilyAPI,'https://lampy-family-api.5sparks.ai');
 for(const key of ['LampyEmailLoginEnabled','LampyUnifiedPurchasesEnabled','LampyPaidExportEnabled','LampyFamilyAlbumPreviewEnabled'])assert.equal(result.ios.infoPlist[key],true);
 assert.equal(result.ios.infoPlist.LampyExportProductID,'lampyepubexport');assert.ok(result.ios.associatedDomains.includes('applinks:lampy-family-api.5sparks.ai'));
 assert.equal(FLAGS.EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED,'1');assert.equal(FLAGS.EXPO_PUBLIC_ALBUM_PRINT_EVAL,'0');
});
test('missing and contaminated flags or product cannot build',()=>{
 for(const key of Object.keys(FLAGS))assert.throws(()=>launchProfile({...env,[key]:undefined}),key);
 for(const build of ['','0','-1','1.2'])assert.throws(()=>launchProfile({...env,LAMPY_BUILD_NUMBER:build}));
 for(const id of ['','app.lampy.export.designtest','another.product'])assert.throws(()=>launchProfile({...env,LAMPY_RELEASE_PRODUCT_ID:id,EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID:id}));
});
test('fresh Xcode shell preserves sandbox configuration and no unrelated credentials',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lampy-tf-'));const output=path.join(dir,'.xcode.env.local');const cwd=path.join(__dirname,'..');
 try{
 execFileSync('bash',['-c','source scripts/release-public-env.sh; source scripts/testflight-sandbox-env.sh; bash scripts/write-family-xcode-env.sh "$1"','prepare',output],{cwd,env:{...process.env,LAMPY_BUILD_NUMBER:'17',LAMPY_SMTP_PASSWORD:'must-not-copy'}});
 assert.ok(!fs.readFileSync(output,'utf8').includes('must-not-copy'));
 const value=execFileSync('bash',['-c',`source "$1"; "$NODE_BINARY" -e 'console.log(JSON.stringify(require("./scripts/testflight-sandbox-profile.cjs").launchProfile(process.env)))'`,'xcode',output],{cwd,env:{PATH:process.env.PATH,HOME:process.env.HOME},encoding:'utf8'});
 assert.deepEqual(JSON.parse(value),{api:'https://lampy-family-api.5sparks.ai',version:'1.0.0',build:'17',productId:'lampyepubexport'});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
