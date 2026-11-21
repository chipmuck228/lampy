const {test}=require('node:test');
const assert=require('node:assert/strict');
const {summarize}=require('./family-photo-metadata-detail.cjs');
test('detects EXIF GPS and XMP location without returning values',()=>{
 const result=summarize([{'SourceFile':'/private/file','GPS:GPSLatitude':12.345,'GPS:GPSLongitude':67.89,'IFD0:Artist':'private-name','XMP-iptcCore:Location':'private-place','ICC_Profile:ProfileDescription':'sRGB'}]);
 assert.equal(result.gpsOrLocationTags,'PRESENT');assert.equal(result.exif,true);assert.equal(result.xmp,true);assert.equal(result.colorProfile,true);
 assert.doesNotMatch(JSON.stringify(result),/12\.345|67\.89|private/);
});
test('ordinary EXIF is not asserted to contain GPS, and parse warnings never mean absent',()=>{
 assert.equal(summarize([{'IFD0:Orientation':1}]).gpsOrLocationTags,'NOT_DETECTED');
 assert.throws(()=>summarize([{'ExifTool:Warning':'private details'}]));
 assert.throws(()=>summarize([]));
});
