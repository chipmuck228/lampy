/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),script=fs.readFileSync(path.join(__dirname,'prepare-family-epub-device.sh'),'utf8');
const stanza=script.slice(script.indexOf('source scripts/release-public-env.sh'),script.indexOf('npx expo prebuild'));
function config(mode){
 const output=execFileSync('bash',['-c',`mode="$TEST_MODE"; product=app.lampy.real.sandbox; ${stanza}\nnode -e 'const config=require("./app.config.cjs")({config:require("./app.json").expo});console.log(JSON.stringify({config,env:process.env}))'`],{cwd:root,encoding:'utf8',env:{...process.env,TEST_MODE:mode,EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED:'1',EXPO_PUBLIC_UNIFIED_PURCHASES:'1',EXPO_PUBLIC_ALBUM_PRINT_EVAL:'1',LAMPY_BUILD_PROFILE:'appstore-launch'}});
 return JSON.parse(output);
}
test('local preview enables Release family visibility, keeps family paid/PDF closed and produces valid Expo config',()=>{
 const {config:c,env:e}=config('preview');assert.equal(e.EXPO_PUBLIC_FAMILY_INTERNAL_TEST,'1');assert.equal(e.EXPO_PUBLIC_FAMILY_ALBUM_EVAL,'1');assert.equal(e.EXPO_PUBLIC_FAMILY_ENTRY_OPEN,'1');assert.equal(e.EXPO_PUBLIC_UNIFIED_PURCHASES,'0');assert.equal(e.EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED,'0');assert.equal(e.EXPO_PUBLIC_ALBUM_PRINT_EVAL,'0');assert.equal(c.ios.infoPlist.LampyUnifiedPurchasesEnabled,false);assert.equal(e.LAMPY_BUILD_PROFILE,undefined);
});
test('sandbox sets matching client/native SKU with unified validation and no local family bypass',()=>{
 const {config:c,env:e}=config('sandbox');assert.equal(e.EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED,'1');assert.equal(e.EXPO_PUBLIC_UNIFIED_PURCHASES,'1');assert.equal(c.ios.infoPlist.LampyUnifiedPurchasesEnabled,true);assert.equal(c.ios.infoPlist.LampyExportProductID,'app.lampy.real.sandbox');assert.equal(e.EXPO_PUBLIC_ALBUM_PRINT_EVAL,'0');
});
