'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync,readFileSync,existsSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {inspectPhoto}=require('./photo-metadata-probe.cjs');
const {probe}=require('./family-api-privacy-probe.cjs');
function tiff(gps) {const b=Buffer.alloc(gps?26:14);b.write('II');b.writeUInt16LE(42,2);b.writeUInt32LE(8,4);b.writeUInt16LE(gps?1:0,8);if(gps){b.writeUInt16LE(0x8825,10);b.writeUInt16LE(4,12);b.writeUInt32LE(1,14);b.writeUInt32LE(24,18);}return b;}
function segment(type,b) {const h=Buffer.alloc(4);h[0]=0xff;h[1]=type;h.writeUInt16BE(b.length+2,2);return Buffer.concat([h,b]);}
function jpeg(data) {return Buffer.concat([Buffer.from([255,216]),segment(0xe1,Buffer.concat([Buffer.from('Exif\0\0'),data])),Buffer.from([255,217])]);}
function png(data) {const chunk=(kind,data)=>{const h=Buffer.alloc(8);h.writeUInt32BE(data.length);h.write(kind,4);return Buffer.concat([h,data,Buffer.alloc(4)]);};return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('eXIf',data),chunk('IEND',Buffer.alloc(0))]);}
test('detects EXIF GPS pointers in JPEG and PNG without emitting values or changing bytes',()=>{
 for(const photo of [jpeg(tiff(true)),png(tiff(true))]){const copy=Buffer.from(photo),r=inspectPhoto(photo);assert.equal(r.gps,'PRESENT');assert.equal(r.sanitized,'NOT_VERIFIED');assert.deepEqual(photo,copy);assert.ok(!/latitude|longitude|coordinates|filename/i.test(JSON.stringify(r)));}
});
test('bounds malformed TIFF/PNG/JPEG and does not claim unsupported formats are safe',()=>{
 for(const photo of [Buffer.from('HEIC'),jpeg(Buffer.from('II')),png(tiff(false)).subarray(0,12),Buffer.from([255,216,255,225,255,255])]){const r=inspectPhoto(photo);assert.equal(r.gps,'UNKNOWN');assert.equal(r.coverage,'INCOMPLETE');}
 const cycle=tiff(false);cycle.writeUInt32LE(8,10);assert.equal(inspectPhoto(jpeg(cycle)).gps,'UNKNOWN');
});
test('recognizes little and big endian EXIF and keeps opaque XMP/text inconclusive',()=>{
 assert.equal(inspectPhoto(jpeg(tiff(false))).gps,'NOT_DETECTED');
 const big=Buffer.alloc(26);big.write('MM');big.writeUInt16BE(42,2);big.writeUInt32BE(8,4);big.writeUInt16BE(1,8);big.writeUInt16BE(0x8825,10);assert.equal(inspectPhoto(jpeg(big)).gps,'PRESENT');
 const xmp=Buffer.concat([Buffer.from([255,216]),segment(0xe1,Buffer.from('http://ns.adobe.com/xap/1.0/ opaque')),Buffer.from([255,217])]);assert.equal(inspectPhoto(xmp).gps,'UNKNOWN');
 const gps=Buffer.concat([Buffer.from([255,216]),segment(0xe1,Buffer.from('exif:GPSLatitude="not-disclosed"')),Buffer.from([255,217])]);assert.equal(inspectPhoto(gps).gps,'PRESENT');assert.ok(!JSON.stringify(inspectPhoto(gps)).includes('not-disclosed'));
});
test('database probe only returns aggregates, preserves database bytes and never creates a missing file',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'lampy-privacy-')),file=path.join(dir,'db');
 try {
  const db=new DatabaseSync(file);db.exec(`CREATE TABLE family_schema_migrations(version INTEGER);INSERT INTO family_schema_migrations VALUES(32);
   CREATE TABLE family_accounts(email TEXT);INSERT INTO family_accounts VALUES('private@example.invalid'),(NULL);
   CREATE TABLE family_sessions(expires_at TEXT);INSERT INTO family_sessions VALUES('2026-01-01'),('invalid'),('2099-01-01');
   CREATE TABLE family_auth_rate_limits(bucket TEXT,window_started_at TEXT);INSERT INTO family_auth_rate_limits VALUES('apple-challenge:192.0.2.123','2026-01-01'),('invite-preview:privatehash','2026-01-01');
   CREATE TABLE family_account_media_cleanup(storage_key TEXT);INSERT INTO family_account_media_cleanup VALUES('private_storage_key');`);db.close();
  const hash=()=>createHash('sha256').update(readFileSync(file)).digest('hex'),before=hash();
  const r=probe(file,new Date('2026-10-19T00:00:00Z'),{LAMPY_FAMILY_HTTP_TRACE:'0'});
  assert.equal(r.accounts.nonemptyEmailRows,1);assert.equal(r.sessions.expired,1);assert.equal(r.sessions.invalidExpiry,1);assert.equal(r.rateBuckets.appleOlderThan24h,1);assert.equal(r.cleanup.pendingAccountMedia,1);assert.equal(r.processFlags.httpTrace,'OFF');assert.equal(r.cloudBackups,'NOT_INSPECTED');assert.equal(hash(),before);
  assert.ok(!/private@example|192\.0\.2|privatehash|private_storage_key/.test(JSON.stringify(r)));
  const missing=path.join(dir,'missing');assert.throws(()=>probe(missing));assert.equal(existsSync(missing),false);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
