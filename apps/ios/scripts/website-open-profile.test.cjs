'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {configureWebsiteOpen}=require('./website-open-profile.cjs');
test('preserves family associated domains, signing settings and closed purchases; is idempotent',()=>{
 const config={ios:{bundleIdentifier:'app.lampy.ios',associatedDomains:['applinks:family-test.yunpura.com'],infoPlist:{LampyPaidExportEnabled:false}}};
 const next=configureWebsiteOpen(config);
 assert.deepEqual(next.ios.associatedDomains,['applinks:family-test.yunpura.com','applinks:open.yunpura.com']);
 assert.equal(next.ios.infoPlist.LampyPaidExportEnabled,false);
 assert.deepEqual(configureWebsiteOpen(next),next);
 assert.deepEqual(config.ios.associatedDomains,['applinks:family-test.yunpura.com']);
});
