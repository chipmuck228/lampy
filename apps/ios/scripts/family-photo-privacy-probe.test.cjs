'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {tmpdir}=require('node:os');
const {createHash}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {probe}=require('./family-photo-privacy-probe.cjs');
function fixture(){
 const root=fs.mkdtempSync(path.join(tmpdir(),'lampy-photo-audit-')),media=path.join(root,'media');fs.mkdirSync(media);const file=path.join(root,'db'),db=new DatabaseSync(file);
 db.exec('CREATE TABLE family_shares(author_user_id TEXT,snapshot_json TEXT,status TEXT);CREATE TABLE family_media_objects(object_id TEXT,owner_user_id TEXT,mime_type TEXT,storage_key TEXT,byte_length INTEGER,content_sha256 TEXT);');
 const bytes=Buffer.from([255,216,255,217]);fs.writeFileSync(path.join(media,'med_abc'),bytes);
 db.prepare('INSERT INTO family_media_objects VALUES(?,?,?,?,?,?)').run('med_abc','author','image/jpeg','med_abc',bytes.length,createHash('sha256').update(bytes).digest('hex'));
 const note='LAMPY_PHOTO_CHECK_20261019_A',snapshot=JSON.stringify({note,media:[{objectId:'med_abc',mimeType:'image/jpeg'}]});
 db.prepare('INSERT INTO family_shares VALUES(?,?,?)').run('author',snapshot,'active');db.close();
 return {root,file,media,snapshot,env:{LAMPY_FAMILY_DATABASE_PATH:file,LAMPY_FAMILY_MEDIA_PATH:media,LAMPY_PHOTO_PROBE_NOTE:note},done:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('checks only explicitly tagged test-share bytes, verifies stored hash and emits no identifiers',()=>{
 const f=fixture();try{const original=fs.readFileSync(f.file),photo=fs.readFileSync(path.join(f.media,'med_abc'));const result=probe(f.env);assert.equal(result.source,'MATCHED_TEST_SHARE_SERVER_FILE');assert.equal(result.integrity,'MATCH');assert.equal(result.format,'JPEG');assert.ok(!/author|med_abc|LAMPY_PHOTO_CHECK/.test(JSON.stringify(result)));assert.deepEqual(fs.readFileSync(f.file),original);assert.deepEqual(fs.readFileSync(path.join(f.media,'med_abc')),photo);}finally{f.done();}
});
test('refuses missing or ambiguous test notes rather than choosing the latest media',()=>{
 const f=fixture();try{assert.throws(()=>probe({...f.env,LAMPY_PHOTO_PROBE_NOTE:'LAMPY_PHOTO_CHECK_MISSING'}),/TEST_RECORD_NOT_FOUND/);const db=new DatabaseSync(f.file);db.prepare('INSERT INTO family_shares VALUES(?,?,?)').run('author',f.snapshot,'active');db.close();assert.throws(()=>probe(f.env),/TEST_RECORD_NOT_UNIQUE/);}finally{f.done();}
});
test('rejects tampered media and cross-author references',()=>{
 const f=fixture();try{fs.writeFileSync(path.join(f.media,'med_abc'),Buffer.from([255,216,0,0]));assert.throws(()=>probe(f.env),/MEDIA_INTEGRITY_FAILED/);const db=new DatabaseSync(f.file);db.exec("UPDATE family_media_objects SET owner_user_id='other'");db.close();assert.throws(()=>probe(f.env),/MEDIA_REFERENCE_INVALID/);}finally{f.done();}
});
