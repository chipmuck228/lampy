'use strict';
// Read-only, aggregated inventory. No migration, media rewrite, GPS values or file names.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');
function checker() {
  const file = path.join(__dirname, '../src/family-api/photo-metadata.ts');
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exported = {}; new Function('exports', compiled)(exported);
  return exported.photoMetadataIsClean;
}
function audit(database, directory) {
  if (!database || !directory || !fs.statSync(database).isFile() || !fs.statSync(directory).isDirectory()) throw Error('INPUT');
  const root = fs.realpathSync(directory), clean = checker();
  const db = new DatabaseSync(database, {readOnly:true});
  try {
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=3000; BEGIN;');
    const schema = Number(db.prepare('SELECT MAX(version) AS version FROM family_schema_migrations').get().version);
    if (![33,34].includes(schema)) throw Error('SCHEMA');
    const result = {schema, mode:'READ_ONLY', indexedPhotos:0, clean:0, needsPreparation:0, invalidOrUnsupported:0,
      missing:0, integrityMismatch:0, unsafePaths:0, unindexedPhotos:0, unindexedNeedsPreparation:0,
      unindexedInvalid:0, partialFiles:0, concurrentChange:0,
      gpsValues:'NOT_READ_OR_PRINTED', physicalErasure:'NOT_VERIFIED', historicalRewrite:'NOT_PERFORMED'};
    const indexed = new Set();
    for (const row of db.prepare('SELECT storage_key,mime_type,byte_length,content_sha256 FROM family_media_objects').iterate()) {
      indexed.add(row.storage_key);
      if (!row.mime_type.startsWith('image/')) continue;
      result.indexedPhotos++;
      if (!/^med_[a-f0-9]+$/.test(row.storage_key)) {result.unsafePaths++;continue;}
      const file = path.join(root,row.storage_key);
      let stat;
      try {stat=fs.lstatSync(file);} catch {result.missing++;continue;}
      if (!stat.isFile() || stat.isSymbolicLink()) {result.unsafePaths++;continue;}
      if (stat.size>8*1024*1024) {result.invalidOrUnsupported++;continue;}
      const bytes=fs.readFileSync(file);
      const after=fs.lstatSync(file);
      if (stat.ino!==after.ino || stat.size!==after.size || stat.mtimeMs!==after.mtimeMs) {result.concurrentChange++;continue;}
      if (bytes.length!==row.byte_length || crypto.createHash('sha256').update(bytes).digest('hex')!==row.content_sha256) {result.integrityMismatch++;continue;}
      try {if(clean(bytes,row.mime_type)) result.clean++; else result.needsPreparation++;}
      catch {result.invalidOrUnsupported++;}
    }
    // Also account for retired/orphan copies: checking only current DB references is insufficient.
    const entries=fs.opendirSync(root);
    try {
      let entry;
      while((entry=entries.readSync())) {
        if (/^med_[a-f0-9]+\.partial$/.test(entry.name)) {result.partialFiles++;continue;}
        if (!/^med_[a-f0-9]+$/.test(entry.name) || indexed.has(entry.name)) continue;
        const file=path.join(root,entry.name),stat=fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink()) {result.unsafePaths++;continue;}
        if (stat.size>8*1024*1024) {result.unindexedInvalid++;continue;}
        const bytes=fs.readFileSync(file);
        const mime=bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes[0]===137&&bytes[1]===80?'image/png':null;
        if (!mime) continue;
        result.unindexedPhotos++;
        try {if(!clean(bytes,mime))result.unindexedNeedsPreparation++;} catch {result.unindexedInvalid++;}
      }
    } finally {entries.closeSync();}
    db.exec('ROLLBACK;');
    return result;
  } finally {db.close();}
}
if(require.main===module) {
  try {
    if(process.argv.length!==2)throw Error('NO_ARGUMENTS');
    process.stdout.write(JSON.stringify(audit(process.env.LAMPY_FAMILY_DATABASE_PATH,process.env.LAMPY_FAMILY_MEDIA_PATH))+'\n');
  } catch {process.stderr.write('Photo audit failed. Check schema 33 or 34, existing paths, permissions and a quiet maintenance window. No private values printed.\n');process.exitCode=1;}
}
module.exports={audit};
