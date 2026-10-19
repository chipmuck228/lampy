'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {inspectPhoto}=require('./photo-metadata-probe.cjs');
function fail(code){throw Object.assign(new Error(code),{code});}
// Explicit test-note lookup only. No filenames, keys, authors, content or coordinates are emitted.
function probe(env) {
 const note=env.LAMPY_PHOTO_PROBE_NOTE;
 if(typeof note!=='string'||!/^LAMPY_PHOTO_CHECK_[A-Z0-9_-]{1,100}$/.test(note))fail('TEST_NOTE_REQUIRED');
 const file=env.LAMPY_FAMILY_DATABASE_PATH,root=env.LAMPY_FAMILY_MEDIA_PATH;
 if(!file||!root||!fs.statSync(file).isFile()||!fs.statSync(root).isDirectory())fail('CONFIG_REQUIRED');
 const db=new DatabaseSync(file,{readOnly:true});
 try {
  db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=3000;');
  const rows=db.prepare("SELECT author_user_id,snapshot_json FROM family_shares WHERE status='active' AND json_extract(snapshot_json,'$.note')=? LIMIT 2").all(note);
  if(rows.length!==1)fail(rows.length?'TEST_RECORD_NOT_UNIQUE':'TEST_RECORD_NOT_FOUND');
  const snapshot=JSON.parse(rows[0].snapshot_json),media=Array.isArray(snapshot.media)?snapshot.media:[];
  if(media.length!==1||typeof media[0].mimeType!=='string'||!media[0].mimeType.startsWith('image/'))fail('ONE_TEST_PHOTO_REQUIRED');
  const object=db.prepare('SELECT owner_user_id,mime_type,storage_key,byte_length,content_sha256 FROM family_media_objects WHERE object_id=?').get(media[0].objectId);
  if(!object||object.owner_user_id!==rows[0].author_user_id||!/^med_[a-f0-9]+$/.test(object.storage_key))fail('MEDIA_REFERENCE_INVALID');
  const base=fs.realpathSync(root),target=fs.realpathSync(path.join(base,object.storage_key));
  if(path.dirname(target)!==base)fail('MEDIA_REFERENCE_INVALID');
  const stat=fs.statSync(target);
  if(!stat.isFile()||stat.size>64*1024*1024||stat.size!==object.byte_length)fail('MEDIA_INTEGRITY_FAILED');
  const bytes=fs.readFileSync(target);
  if(bytes.length!==object.byte_length||createHash('sha256').update(bytes).digest('hex')!==object.content_sha256||object.mime_type!==media[0].mimeType)fail('MEDIA_INTEGRITY_FAILED');
  return {source:'MATCHED_TEST_SHARE_SERVER_FILE',matchedShares:1,matchedImages:1,integrity:'MATCH',...inspectPhoto(bytes)};
 } finally {db.close();}
}
if(require.main===module){try{console.log(JSON.stringify(probe(process.env)));}catch(e){const allowed=['TEST_NOTE_REQUIRED','CONFIG_REQUIRED','TEST_RECORD_NOT_UNIQUE','TEST_RECORD_NOT_FOUND','ONE_TEST_PHOTO_REQUIRED','MEDIA_REFERENCE_INVALID','MEDIA_INTEGRITY_FAILED'];console.log(JSON.stringify({error:allowed.includes(e.code)?e.code:'PHOTO_PROBE_FAILED'}));process.exitCode=1;}}
module.exports={probe};
