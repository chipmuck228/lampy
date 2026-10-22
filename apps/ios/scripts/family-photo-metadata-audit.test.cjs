'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), os=require('node:os'), crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const ts=require('typescript');
const {audit}=require('./family-photo-metadata-audit.cjs');
function samples(){
 const exported={},source=fs.readFileSync(path.join(__dirname,'../src/family-api/media-validate.ts'),'utf8');
 new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exported,()=>({}));
 return exported;
}
test('aggregates indexed and orphan metadata without printing values or modifying DB/files',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lampy-photo-audit-')),media=path.join(dir,'media'),file=path.join(dir,'family.sqlite');
 fs.mkdirSync(media);const db=new DatabaseSync(file);
 try {
  db.exec('CREATE TABLE family_schema_migrations(version INTEGER); INSERT INTO family_schema_migrations VALUES(33); CREATE TABLE family_media_objects(storage_key TEXT,mime_type TEXT,byte_length INTEGER,content_sha256 TEXT);');
  const clean=samples().sampleJpegBytes();
  const dirty=Buffer.from([255,216,255,225,0,10,71,80,83,0,49,50,51,52,...clean.subarray(2)]);
  const add=(key,bytes,hash)=>{fs.writeFileSync(path.join(media,key),bytes);db.prepare('INSERT INTO family_media_objects VALUES(?,?,?,?)').run(key,'image/jpeg',bytes.length,hash||crypto.createHash('sha256').update(bytes).digest('hex'));};
  add('med_a',clean);add('med_b',dirty);add('med_c',clean,'invalid-hash');
  fs.writeFileSync(path.join(media,'med_d'),dirty);fs.writeFileSync(path.join(media,'med_e.partial'),dirty);
  fs.symlinkSync(path.join(media,'med_b'),path.join(media,'med_f'));
  const before=fs.readFileSync(file),result=audit(file,media),printed=JSON.stringify(result);
  assert.equal(result.indexedPhotos,3);assert.equal(result.clean,1);assert.equal(result.needsPreparation,1);assert.equal(result.integrityMismatch,1);
  assert.equal(result.unindexedPhotos,1);assert.equal(result.unindexedNeedsPreparation,1);assert.equal(result.partialFiles,1);assert.equal(result.unsafePaths,1);
  assert.doesNotMatch(printed,/med_b|1234|storage_key|latitude|longitude/);
  assert.deepEqual(fs.readFileSync(file),before);assert.deepEqual(fs.readFileSync(path.join(media,'med_b')),dirty);
 } finally {db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('refuses missing files without creating a DB, and refuses a different schema',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lampy-photo-audit-')),file=path.join(dir,'missing.sqlite');
 try {
  assert.throws(()=>audit(file,dir));assert.equal(fs.existsSync(file),false);
  const db=new DatabaseSync(file);db.exec('CREATE TABLE family_schema_migrations(version INTEGER); INSERT INTO family_schema_migrations VALUES(32);');db.close();
  assert.throws(()=>audit(file,dir));
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
