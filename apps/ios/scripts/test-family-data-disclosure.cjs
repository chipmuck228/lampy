'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {inspect}=require('./family-data-disclosure-probe.cjs');
test('read-only aggregate excludes private values and preserves database bytes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lampy-disclosure-'));
 try {
  const file=path.join(dir,'test.sqlite');const db=new DatabaseSync(file);
  db.exec(`CREATE TABLE family_schema_migrations(version INTEGER); INSERT INTO family_schema_migrations VALUES(33);
  CREATE TABLE family_accounts(email TEXT); INSERT INTO family_accounts VALUES('secret@example.invalid');
  CREATE TABLE family_auth_rate_limits(bucket TEXT,window_started_at TEXT,hit_count INTEGER);
  INSERT INTO family_auth_rate_limits VALUES('apple-challenge:192.0.2.99','2020-01-01T00:00:00Z',3);`);
  for(const table of ['family_memberships','family_user_blocks','family_invite_links','family_shares','family_media_objects','family_albums','family_safety_reports','family_moderation_audit','family_sharing_restriction_audit','family_purchases'])db.exec(`CREATE TABLE ${table}(secret TEXT)`);
  db.close();const before=fs.readFileSync(file);const result=inspect(file);
  assert.equal(result.appleRateBuckets.olderThan24h,1);assert.equal(result.accounts.nonemptyEmailRows,1);
  assert.doesNotMatch(JSON.stringify(result),/secret@|192\.0\.2|2020-01/);
  assert.deepEqual(fs.readFileSync(file),before);
  const edit=new DatabaseSync(file);edit.exec('UPDATE family_schema_migrations SET version=34');edit.close();
  assert.throws(()=>inspect(file),/SCHEMA_33_REQUIRED/);
  assert.throws(()=>inspect(path.join(dir,'missing.sqlite')));assert.equal(fs.existsSync(path.join(dir,'missing.sqlite')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('manifest and questionnaire use the same categories and purpose',()=>{
 const config=require('../app.json').expo.ios.privacyManifests;
 assert.equal(config.NSPrivacyTracking,false);assert.deepEqual(config.NSPrivacyTrackingDomains,[]);
 const expected=['AudioData','Contacts','CustomerSupport','OtherDataTypes','OtherUserContent','PhotosorVideos','UserID'].map(n=>'NSPrivacyCollectedDataType'+n).sort();
 assert.deepEqual(config.NSPrivacyCollectedDataTypes.map(x=>x.NSPrivacyCollectedDataType).sort(),expected);
 const mapping=fs.readFileSync(path.join(__dirname,'../spec/release/V1-DATA-DISCLOSURE.md'),'utf8');
 for(const entry of config.NSPrivacyCollectedDataTypes){assert.equal(entry.NSPrivacyCollectedDataTypeLinked,true);assert.equal(entry.NSPrivacyCollectedDataTypeTracking,false);assert.deepEqual(entry.NSPrivacyCollectedDataTypePurposes,['NSPrivacyCollectedDataTypePurposeAppFunctionality']);assert.ok(mapping.includes(entry.NSPrivacyCollectedDataType));}
});
