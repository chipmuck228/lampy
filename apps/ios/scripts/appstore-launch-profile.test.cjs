'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {FLAGS,launchProfile}=require('./appstore-launch-profile.cjs');
const {configure}=require('./family-internal-profile.cjs');const {configureAlbumExport}=require('./album-export-profile.cjs');
// Fixture identifier only; never a configured production SKU.
const env={...FLAGS,LAMPY_BUILD_PROFILE:'appstore-launch',LAMPY_BUILD_NUMBER:'20',LAMPY_RELEASE_PRODUCT_ID:'app.lampy.archive',EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID:'app.lampy.archive'};
test('launch profile aligns native flags, production domains and email privacy without changing the base',()=>{
 const base=require('../app.json').expo;const before=JSON.stringify(base);const result=configureAlbumExport(configure(base,env),env);
 assert.equal(JSON.stringify(base),before);assert.equal(result.ios.infoPlist.LampyBuildProfile,'appstore-launch');
 for(const key of ['LampyEmailLoginEnabled','LampyUnifiedPurchasesEnabled','LampyPaidExportEnabled'])assert.equal(result.ios.infoPlist[key],true);
 assert.equal(result.ios.infoPlist.LampyExportProductID,env.LAMPY_RELEASE_PRODUCT_ID);
 assert.equal(result.ios.buildNumber,'20');assert.ok(result.ios.associatedDomains.includes('applinks:lampy-family-api.5sparks.ai'));
 const data=result.ios.privacyManifests.NSPrivacyCollectedDataTypes;
 assert.equal(data.length,base.ios.privacyManifests.NSPrivacyCollectedDataTypes.length+2);
 assert.ok(data.some(row=>row.NSPrivacyCollectedDataType==='NSPrivacyCollectedDataTypePurchaseHistory'));
 assert.deepEqual(data.find(row=>row.NSPrivacyCollectedDataType==='NSPrivacyCollectedDataTypeEmailAddress'),{NSPrivacyCollectedDataType:'NSPrivacyCollectedDataTypeEmailAddress',NSPrivacyCollectedDataTypeLinked:true,NSPrivacyCollectedDataTypeTracking:false,NSPrivacyCollectedDataTypePurposes:['NSPrivacyCollectedDataTypePurposeAppFunctionality']});
});
test('missing, contaminated or local-test configuration is rejected',()=>{
 for(const key of Object.keys(FLAGS))assert.throws(()=>launchProfile({...env,[key]:undefined}),key);
 for(const build of ['','0','-1','1.2'])assert.throws(()=>launchProfile({...env,LAMPY_BUILD_NUMBER:build}));
 for(const id of ['', 'app.lampy.export.test','example.sku','your_product_id','placeholder'])assert.throws(()=>launchProfile({...env,LAMPY_RELEASE_PRODUCT_ID:id,EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID:id}));
 assert.throws(()=>launchProfile({...env,EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID:'different.id'}));
});
test('an independent Xcode shell retains the launch configuration and only public identifiers',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lampy-launch-'));const output=path.join(dir,'.xcode.env.local');const cwd=path.join(__dirname,'..');
 try{
 execFileSync('bash',['-c','source scripts/release-public-env.sh; source scripts/appstore-launch-env.sh; bash scripts/write-family-xcode-env.sh "$1"','prepare',output],{cwd,env:{...process.env,LAMPY_BUILD_NUMBER:'20',LAMPY_RELEASE_PRODUCT_ID:env.LAMPY_RELEASE_PRODUCT_ID,LAMPY_SMTP_PASSWORD:'never-copy-secret'}});
 assert.ok(!fs.readFileSync(output,'utf8').includes('never-copy-secret'));
 const result=execFileSync('bash',['-c',`source "$1"; "$NODE_BINARY" -e 'console.log(require("./scripts/appstore-launch-profile.cjs").launchProfile(process.env).productId)'`,'xcode',output],{cwd,env:{PATH:process.env.PATH,HOME:process.env.HOME},encoding:'utf8'});
 assert.equal(result.trim(),env.LAMPY_RELEASE_PRODUCT_ID);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
