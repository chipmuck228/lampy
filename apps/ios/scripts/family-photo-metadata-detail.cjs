'use strict';
// Read-only historical candidates; retain no ExifTool values in output.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {DatabaseSync} = require('node:sqlite');
function summarize(rows) {
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || typeof rows[0] !== 'object') throw Error('METADATA_RESULT');
  const keys=Object.keys(rows[0]);
  if (keys.some(k=>/(?:^|:)(?:Error|Warning)$/.test(k))) throw Error('METADATA_WARNING');
  return {
    exif: keys.some(k=>/^(IFD\d|ExifIFD|GPS|InteropIFD|MakerNotes):/.test(k)),
    xmp: keys.some(k=>/^XMP(?:-|:)/.test(k)),
    iptc: keys.some(k=>/^IPTC:/.test(k)),
    colorProfile: keys.some(k=>/^ICC/.test(k)),
    pngText: keys.some(k=>/^PNG:(?:Comment|Description|Title|Author|Software|CreationTime|Copyright|TextualData)$/.test(k)),
    gpsOrLocationTags: keys.some(k=>/GPS|Latitude|Longitude|Location|Geotag|Geolocation/i.test(k)) ? 'PRESENT' : 'NOT_DETECTED',
    coverage: 'EXIFTOOL_RECOGNIZED_TAGS_NOT_ALL_POSSIBLE_PAYLOADS',
  };
}
function run() {
  const database=process.env.LAMPY_FAMILY_DATABASE_PATH, media=process.env.LAMPY_FAMILY_MEDIA_PATH;
  if(!database || !media || !fs.statSync(database).isFile())throw Error('INPUT');
  const root=fs.realpathSync(media);
  const ts=require('typescript');
  const source=fs.readFileSync(path.join(__dirname,'../src/family-api/photo-metadata.ts'),'utf8');
  const exported={};new Function('exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exported);
  // Fixed executable and read-only arguments. No shell interpolation or write tags.
  const version=execFileSync('/usr/bin/exiftool',['-config','','-ver'],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}).trim();
  if(!/^\d+(?:\.\d+)+$/.test(version))throw Error('TOOL_VERSION');
  const db=new DatabaseSync(database,{readOnly:true});
  try {
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=3000; BEGIN');
    if(db.prepare('SELECT MAX(version) AS n FROM family_schema_migrations').get().n!==33)throw Error('SCHEMA');
    const samples=[];let indexedPhotos=0,clean=0;
    for(const row of db.prepare("SELECT storage_key,mime_type,byte_length,content_sha256 FROM family_media_objects WHERE mime_type LIKE 'image/%'").iterate()) {
      indexedPhotos++;
      if(!/^med_[a-f0-9]+$/.test(row.storage_key))throw Error('PATH');
      const file=path.join(root,row.storage_key),before=fs.lstatSync(file);
      if(!before.isFile() || before.isSymbolicLink() || before.size>8*1024*1024)throw Error('FILE');
      const bytes=fs.readFileSync(file);
      if(bytes.length!==row.byte_length || crypto.createHash('sha256').update(bytes).digest('hex')!==row.content_sha256)throw Error('INTEGRITY');
      if(exported.photoMetadataIsClean(bytes,row.mime_type)){clean++;continue;}
      // Source bytes already verified; stdin avoids exposing server paths to the tool.
      const raw=execFileSync('/usr/bin/exiftool',['-config','','-j','-G1','-s','-a','-n','-'],{input:bytes,encoding:'utf8',timeout:15000,maxBuffer:8*1024*1024,stdio:['pipe','pipe','pipe']});
      const metadata=summarize(JSON.parse(raw));
      const after=fs.lstatSync(file);
      if(before.ino!==after.ino || before.size!==after.size || before.mtimeMs!==after.mtimeMs)throw Error('CONCURRENT_CHANGE');
      samples.push({sample:samples.length+1,format:row.mime_type==='image/jpeg'?'JPEG':row.mime_type==='image/png'?'PNG':'OTHER',...metadata});
    }
    return {probe:'HISTORICAL_PHOTO_METADATA_DETAIL',mode:'READ_ONLY',schema:33,toolVersion:version,indexedPhotos,clean,candidates:samples.length,samples,privateValues:'NOT_PRINTED',rewrite:'NOT_PERFORMED',backups:'NOT_INSPECTED',physicalErasure:'NOT_VERIFIED'};
  }finally{db.close();}
}
module.exports={summarize};
if(require.main===module){try{console.log(JSON.stringify(run()));}catch{console.error(JSON.stringify({probe:'HISTORICAL_PHOTO_METADATA_DETAIL',result:'FAILED',reason:'CHECK_EXIFTOOL_SCHEMA_INTEGRITY_AND_QUIET_WINDOW',gps:'UNKNOWN',privateValues:'NOT_PRINTED'}));process.exitCode=1;}}
