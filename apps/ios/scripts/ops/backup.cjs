'use strict';
const fs=require('node:fs/promises'),fss=require('node:fs'),path=require('node:path');
const {DatabaseSync,backup}=require('node:sqlite');
const {createHash,randomBytes}=require('node:crypto');
const {syncDir,jsonWrite}=require('./files.cjs');
const DAY=86400000,ID=/^backup-\d{8}T\d{9}Z-[a-f0-9]{12}$/;
const key=v=>typeof v==='string'&&/^med_[a-f0-9]+$/.test(v);
function fail(){throw Error('BACKUP_CHECK_FAILED');}
async function directory(p){const s=await fs.lstat(p);if(!s.isDirectory()||s.isSymbolicLink()||await fs.realpath(p)!==path.resolve(p))fail();return s;}
function inside(a,b){return a===b||a.startsWith(b+path.sep);}
async function digest(file,dest){
 const input=await fs.open(file,fss.constants.O_RDONLY|fss.constants.O_NOFOLLOW);let output;
 try{
  const original=await input.stat();if(!original.isFile())fail();
  if(dest)output=await fs.open(dest,'wx',0o600);
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of input.createReadStream({autoClose:false})){hash.update(chunk);bytes+=chunk.length;if(output)await output.writeFile(chunk);}
  const final=await input.stat();if(original.size!==bytes||original.size!==final.size||original.mtimeMs!==final.mtimeMs||original.ctimeMs!==final.ctimeMs)fail();
  if(output)await output.sync();return {bytes,sha256:hash.digest('hex')};
 }finally{await output?.close();await input.close();}
}
async function preflight(c){
 const db=path.resolve(c.database),media=path.resolve(c.media),root=path.resolve(c.root);
 if(inside(root,path.dirname(db))||inside(path.dirname(db),root)||inside(root,media)||inside(media,root))fail();
 const d=await fs.lstat(db),m=await directory(media),r=await directory(root);
 if(!d.isFile()||d.isSymbolicLink()||await fs.realpath(db)!==db||(r.mode&0o077)!==0||r.uid!==process.getuid())fail();
 if(c.requireSeparateVolume!==false&&(r.dev===d.dev||r.dev===m.dev))throw Error('SEPARATE_BACKUP_VOLUME_REQUIRED');
 if(typeof backup!=='function')throw Error('SQLITE_BACKUP_UNAVAILABLE');
 return {database:db,media,root};
}
function schema(db){const s=Number(db.prepare('SELECT MAX(version) AS v FROM family_schema_migrations').get().v);if(![33,34].includes(s))fail();return s;}
function inventory(db){
 if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')fail();
 return db.prepare('SELECT storage_key,byte_length,content_sha256 FROM family_media_objects ORDER BY storage_key').all().map(r=>{
  if(!key(r.storage_key)||!Number.isSafeInteger(r.byte_length)||r.byte_length<=0||!/^[a-f0-9]{64}$/.test(r.content_sha256))fail();
  return {name:r.storage_key,bytes:r.byte_length,sha256:r.content_sha256};
 });
}
// Caller MUST stop every writer (API, Admin, cleanup, operator CLIs) until this
// returns. Online DB backup alone cannot coordinate separate media-file deletion.
async function createBackup(config,kind='automatic',now=new Date()){
 if(!['automatic','manual'].includes(kind)||!Number.isFinite(now.getTime()))fail();
 const c=await preflight(config),id='backup-'+now.toISOString().replace(/[-:.]/g,'')+'-'+randomBytes(6).toString('hex');
 const partial=path.join(c.root,id+'.partial'),final=path.join(c.root,id);await fs.mkdir(partial,{mode:0o700});
 try{
  // All writers are stopped by the caller. A WAL database may need to create
  // -wal/-shm even for a read-only connection after its last writer closes.
  // Keep the production mount read-only: recover SQLite only on private copies
  // of the database and optional WAL. Never copy the transient shared-memory file.
  const sourceDir=path.join(partial,'.source');await fs.mkdir(sourceDir,{mode:0o700});
  const sourcePath=path.join(sourceDir,'family.sqlite');await digest(c.database,sourcePath);
  try{await digest(c.database+'-wal',sourcePath+'-wal');}catch(e){if(e.code!=='ENOENT')throw e;}
  const source=new DatabaseSync(sourcePath);try{await backup(source,path.join(partial,'family.sqlite'));}finally{source.close();}
  await fs.rm(sourceDir,{recursive:true,force:false});
  await fs.chmod(path.join(partial,'family.sqlite'),0o600);
  const snapshot=new DatabaseSync(path.join(partial,'family.sqlite'));let version,files;
  try{
   version=schema(snapshot);snapshot.exec('PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON;');
   for(const table of ['family_sessions','family_apple_challenges','family_auth_rate_limits'])if(snapshot.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))snapshot.exec(`DELETE FROM ${table}`);
   // Rebuild only the private backup copy, dropping free pages from older deletes.
   // This is logical minimization, not a claim about physical media erasure.
   snapshot.exec('VACUUM;');files=inventory(snapshot);
  }finally{snapshot.close();}
  await fs.mkdir(path.join(partial,'media'),{mode:0o700});
  for(const file of files){const copied=await digest(path.join(c.media,file.name),path.join(partial,'media',file.name));if(copied.bytes!==file.bytes||copied.sha256!==file.sha256)fail();}
  const dbHash=await digest(path.join(partial,'family.sqlite'));
  const dbFile=await fs.open(path.join(partial,'family.sqlite'),'r');try{await dbFile.sync();}finally{await dbFile.close();}
  const manifest={format:1,id,kind,createdAt:now.toISOString(),expiresAt:new Date(now.getTime()+7*DAY).toISOString(),schema:version,database:dbHash,media:files};
  await jsonWrite(path.join(partial,'manifest.json'),manifest);await syncDir(path.join(partial,'media'));await syncDir(partial);
  await fs.rename(partial,final);await syncDir(c.root);
  return {event:'BACKUP_COMPLETE',files:files.length,bytes:dbHash.bytes+files.reduce((n,f)=>n+f.bytes,0),createdAt:manifest.createdAt,kind};
 }catch(e){await fs.rm(partial,{recursive:true,force:true});throw e;}
}
async function manifestAt(root,id){
 if(!ID.test(id))fail();const dir=path.join(root,id);await directory(dir);
 const fd=await fs.open(path.join(dir,'manifest.json'),fss.constants.O_RDONLY|fss.constants.O_NOFOLLOW);let value;
 try{const stat=await fd.stat();if(!stat.isFile()||stat.size>16*1024*1024)fail();value=JSON.parse(await fd.readFile('utf8'));}finally{await fd.close();}
 if(value.format!==1||value.id!==id||!['automatic','manual'].includes(value.kind)||![33,34].includes(value.schema)||!Number.isFinite(Date.parse(value.createdAt))||value.expiresAt!==new Date(Date.parse(value.createdAt)+7*DAY).toISOString()||!Array.isArray(value.media))fail();
 const expectedTime=id.slice(7,26);if(value.createdAt.replace(/[-:.]/g,'')!==expectedTime)fail();
 const seen=new Set();for(const file of value.media){if(!key(file.name)||seen.has(file.name)||!Number.isSafeInteger(file.bytes)||file.bytes<=0||!/^[a-f0-9]{64}$/.test(file.sha256))fail();seen.add(file.name);}
 if(!value.database||!Number.isSafeInteger(value.database.bytes)||value.database.bytes<=0||!/^[a-f0-9]{64}$/.test(value.database.sha256))fail();
 return value;
}
async function verifyBackup(root,id){
 root=path.resolve(root);await directory(root);const m=await manifestAt(root,id),dir=path.join(root,id);
 const hash=await digest(path.join(dir,'family.sqlite'));if(hash.bytes!==m.database.bytes||hash.sha256!==m.database.sha256)fail();
 const db=new DatabaseSync(path.join(dir,'family.sqlite'),{readOnly:true});try{if(schema(db)!==m.schema||JSON.stringify(inventory(db))!==JSON.stringify(m.media))fail();}finally{db.close();}
 await directory(path.join(dir,'media'));const names=(await fs.readdir(path.join(dir,'media'))).sort();if(JSON.stringify(names)!==JSON.stringify(m.media.map(f=>f.name).sort()))fail();
 for(const f of m.media){const hash=await digest(path.join(dir,'media',f.name));if(hash.bytes!==f.bytes||hash.sha256!==f.sha256)fail();}
 return m;
}
async function pruneBackups(root,now=new Date()){
 root=path.resolve(root);const permissions=await directory(root);if((permissions.mode&0o077)!==0||permissions.uid!==process.getuid()||!Number.isFinite(now.getTime()))fail();let removed=0,partials=0,rejected=0;
 for(const name of await fs.readdir(root)){
  if(ID.test(name)){
   let m;try{m=await manifestAt(root,name);}catch{rejected++;continue;}
   if(Date.parse(m.expiresAt)<=now.getTime()){await fs.rm(path.join(root,name),{recursive:true,force:false});removed++;}
  }else if(name.endsWith('.partial')&&ID.test(name.slice(0,-8))){
   const p=path.join(root,name),s=await fs.lstat(p);if(s.isSymbolicLink()||!s.isDirectory()){rejected++;continue;}
   if(s.mtimeMs<=now.getTime()-DAY){await fs.rm(p,{recursive:true});partials++;}
  }
 }
 await syncDir(root);return {event:'BACKUP_PRUNE_COMPLETE',removed,partials,rejected};
}
// Rehearsal only: the transient copy is never published or left as another backup.
// A production recovery MUST reconcile post-backup deletions/withdrawals and
// moderation from independent evidence. This tool deliberately cannot do that.
async function rehearse(root,id,checkRoot){
 const m=await verifyBackup(root,id);const permissions=await directory(checkRoot);if((permissions.mode&0o077)!==0||permissions.uid!==process.getuid())fail();
 const c=await fs.mkdtemp(path.join(checkRoot,'rehearsal-'));await fs.chmod(c,0o700);
 try{
  const target=path.join(c,id);await fs.mkdir(target,{mode:0o700});await fs.mkdir(path.join(target,'media'),{mode:0o700});
  await digest(path.join(root,id,'family.sqlite'),path.join(target,'family.sqlite'));
  await fs.copyFile(path.join(root,id,'manifest.json'),path.join(target,'manifest.json'));await fs.chmod(path.join(target,'manifest.json'),0o600);
  for(const f of m.media)await digest(path.join(root,id,'media',f.name),path.join(target,'media',f.name));
  await verifyBackup(c,id);
  return {event:'RESTORE_REHEARSAL_COMPLETE',files:m.media.length,schema:m.schema,publishAllowed:false,reconciliation:'REQUIRED'};
 }finally{await fs.rm(c,{recursive:true,force:true});}
}
module.exports={preflight,createBackup,verifyBackup,pruneBackups,rehearse,jsonWrite,ID};
