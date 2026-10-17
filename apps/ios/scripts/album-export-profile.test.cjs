/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict');
const {configureAlbumExport}=require('./album-export-profile.cjs');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
test('is native-default-off and strips inherited paid/product settings',()=>{
 const config=configureAlbumExport({ios:{infoPlist:{LampyPaidExportEnabled:true,LampyExportProductID:'old',Other:'keep'}}},{});
 assert.equal(config.ios.infoPlist.LampyPaidExportEnabled,false);assert.equal(config.ios.infoPlist.LampyExportProductID,'');assert.equal(config.ios.infoPlist.Other,'keep');
});
test('requires both switches and a real configured product identifier',()=>{
 assert.equal(configureAlbumExport({}, {EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED:'1'}).ios.infoPlist.LampyPaidExportEnabled,false);
 assert.throws(()=>configureAlbumExport({},{EXPO_PUBLIC_ALBUM_EXPORT_ENABLED:'1',EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED:'1'}));
 const config=configureAlbumExport({}, {EXPO_PUBLIC_ALBUM_EXPORT_ENABLED:'1',EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED:'1',EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID:'app.lampy.export'});
 assert.equal(config.ios.infoPlist.LampyPaidExportEnabled,true);assert.equal(config.ios.infoPlist.LampyExportProductID,'app.lampy.export');
});
test('rejects ambiguous switch values instead of silently enabling free export',()=>{
 assert.throws(()=>configureAlbumExport({}, {EXPO_PUBLIC_ALBUM_EXPORT_ENABLED:'true'}));
 assert.throws(()=>configureAlbumExport({}, {EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED:'yes'}));
});
test('public archive profile clears inherited paid-test flags before native configuration',()=>{
 const keys=['EXPO_PUBLIC_UNIFIED_PURCHASES','EXPO_PUBLIC_ALBUM_EXPORT_ENABLED','EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED','EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID','EXPO_PUBLIC_ALBUM_PRINT_EVAL'];
 const env={...process.env,...Object.fromEntries(keys.map(key=>[key,key.endsWith('PRODUCT_ID')?'app.lampy.export.test':'1']))};
 const output=execFileSync('bash',['-c','source "$1"; node -e \'console.log(JSON.stringify(process.env))\'','album-release-test',path.join(__dirname,'release-public-env.sh')],{env,encoding:'utf8'});
 const released=JSON.parse(output);
 for(const key of keys)assert.equal(released[key],key.endsWith('PRODUCT_ID')?'':'0');
 assert.equal(configureAlbumExport({},released).ios.infoPlist.LampyPaidExportEnabled,false);
 assert.equal(configureAlbumExport({},released).ios.infoPlist.LampyExportProductID,'');
});

test('unified purchases fail closed without paid export and mirror a separate native flag',()=>{
 assert.throws(()=>configureAlbumExport({}, {EXPO_PUBLIC_UNIFIED_PURCHASES:'1'}));
 const cfg=configureAlbumExport({}, {EXPO_PUBLIC_UNIFIED_PURCHASES:'1',EXPO_PUBLIC_ALBUM_EXPORT_ENABLED:'1',EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED:'1',EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID:'configured.unified'});
 assert.equal(cfg.ios.infoPlist.LampyUnifiedPurchasesEnabled,true);
 assert.equal(configureAlbumExport({},{}).ios.infoPlist.LampyUnifiedPurchasesEnabled,false);
});

test('cannot configure a free formal export path',()=>{
 assert.throws(()=>configureAlbumExport({}, {EXPO_PUBLIC_ALBUM_EXPORT_ENABLED:'1'}), /require paid/);
});
