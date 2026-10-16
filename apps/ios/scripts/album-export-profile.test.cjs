const test=require('node:test'),assert=require('node:assert/strict');
const {configureAlbumExport}=require('./album-export-profile.cjs');
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
