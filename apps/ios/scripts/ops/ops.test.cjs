'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),{createHash}=require('node:crypto');
const {createBackup,verifyBackup,rehearse,pruneBackups}=require('./backup.cjs');
const {maintenance,resume,pruneChecks}=require('../lampy-backup.cjs');
const {collect}=require('./collector.cjs');
const now=new Date('2026-10-23T00:00:00.000Z'),DAY=86400000,owner='a'.repeat(32);
async function fixture(){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lampy-ops-')),data=path.join(dir,'data'),root=path.join(dir,'backup'),state=path.join(dir,'state'),checkRoot=path.join(dir,'checks');
 for(const d of [data,root,state,checkRoot])await fs.mkdir(d,{mode:0o700});const media=path.join(data,'media');await fs.mkdir(media);
 const database=path.join(data,'family.sqlite'),db=new DatabaseSync(database);db.exec('PRAGMA journal_mode=WAL; CREATE TABLE family_schema_migrations(version INTEGER); INSERT INTO family_schema_migrations VALUES(33); CREATE TABLE family_media_objects(storage_key TEXT,byte_length INTEGER,content_sha256 TEXT); CREATE TABLE private_rows(note TEXT); CREATE TABLE family_sessions(token TEXT);');db.prepare('INSERT INTO family_sessions VALUES(?)').run('private-session-token');
 db.prepare('INSERT INTO private_rows VALUES(?)').run('secret original');const bytes=Buffer.from('synthetic media bytes');
 db.prepare('INSERT INTO family_media_objects VALUES(?,?,?)').run('med_abcd',bytes.length,createHash('sha256').update(bytes).digest('hex'));await fs.writeFile(path.join(media,'med_abcd'),bytes);
 return {dir,db,root,state,database,media,checkRoot,requireSeparateVolume:false,async close(){db.close();await fs.rm(dir,{recursive:true,force:true});}};
}
async function names(f){return (await fs.readdir(f.root)).filter(n=>!n.endsWith('.partial'));}
test('backs up a closed WAL database without creating production sidecars or changing source bytes',async()=>{
 const f=await fixture();f.db.close();
 try{
  const before=await fs.readFile(f.database),entries=await fs.readdir(path.dirname(f.database));
  await fs.chmod(f.database,0o400);await fs.chmod(path.dirname(f.database),0o500);
  await createBackup(f,'manual',now);const id=(await names(f))[0];
  await verifyBackup(f.root,id);assert.deepEqual(await fs.readFile(f.database),before);
  assert.deepEqual(await fs.readdir(path.dirname(f.database)),entries);
  assert.deepEqual((await fs.readdir(path.join(f.root,id))).sort(),['family.sqlite','manifest.json','media']);
 }finally{await fs.chmod(path.dirname(f.database),0o700);await fs.rm(f.dir,{recursive:true,force:true});}
});
test('copies uncheckpointed WAL bytes without changing them and rejects a symlinked WAL',async()=>{
 const f=await fixture();try{
  const wal=f.database+'-wal',before=await fs.readFile(wal);assert.ok(before.length>0);
  await createBackup(f,'manual',now);assert.deepEqual(await fs.readFile(wal),before);
  const id=(await names(f))[0];await verifyBackup(f.root,id);
 }finally{await f.close();}
 const g=await fixture();g.db.close();try{
  await fs.symlink(g.database,g.database+'-wal');await assert.rejects(createBackup(g,'manual',now));assert.deepEqual(await fs.readdir(g.root),[]);
 }finally{await fs.rm(g.dir,{recursive:true,force:true});}
});
test('copies a live-WAL database and matching media, verifies and rehearses offline without modifying originals',async()=>{
 const f=await fixture();try{
  const result=await createBackup(f,'manual',now),id=(await names(f))[0];assert.equal(result.files,1);assert.doesNotMatch(JSON.stringify(result),/secret|med_abcd|sqlite|\/tmp/);
  const manifest=await verifyBackup(f.root,id);assert.equal(manifest.kind,'manual');assert.equal((await fs.stat(path.join(f.root,id))).mode&0o777,0o700);assert.equal((await fs.stat(path.join(f.root,id,'family.sqlite'))).mode&0o777,0o600);
  const copy=new DatabaseSync(path.join(f.root,id,'family.sqlite'),{readOnly:true});try{assert.equal(copy.prepare('SELECT note FROM private_rows').get().note,'secret original');assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM family_sessions').get().n,0);}finally{copy.close();}
  assert.deepEqual(await rehearse(f.root,id,f.checkRoot),{event:'RESTORE_REHEARSAL_COMPLETE',files:1,schema:33,publishAllowed:false,reconciliation:'REQUIRED'});assert.deepEqual(await fs.readdir(f.checkRoot),[]);assert.equal(f.db.prepare('SELECT token FROM family_sessions').get().token,'private-session-token');assert.equal(f.db.prepare('SELECT note FROM private_rows').get().note,'secret original');
  await fs.writeFile(path.join(f.root,id,'media','med_abcd'),'corrupt');await assert.rejects(verifyBackup(f.root,id));
 }finally{await f.close();}
});
test('refuses symlinked media, corrupt bytes and an unsafe/same-volume destination before publishing a backup',async()=>{
 const f=await fixture();try{
  await assert.rejects(createBackup({...f,requireSeparateVolume:true},'automatic',now),/SEPARATE_BACKUP_VOLUME_REQUIRED/);
  await assert.rejects(createBackup({...f,root:f.media},'automatic',now));
  const file=path.join(f.media,'med_abcd');await fs.rm(file);await fs.symlink(f.database,file);await assert.rejects(createBackup(f,'automatic',now));assert.deepEqual(await fs.readdir(f.root),[]);
  await fs.rm(file);await fs.writeFile(file,'changed source');await assert.rejects(createBackup(f,'automatic',now));assert.deepEqual(await fs.readdir(f.root),[]);
 }finally{await f.close();}
});
test('expires automatic and manual sets at seven days, keeps unrecognized data, and never follows a backup symlink',async()=>{
 const f=await fixture();try{
  await createBackup(f,'automatic',now);await createBackup(f,'manual',new Date(now.getTime()+1));
  assert.equal((await pruneBackups(f.root,new Date(now.getTime()+7*DAY-1))).removed,0);
  assert.equal((await pruneBackups(f.root,new Date(now.getTime()+7*DAY))).removed,1);
  assert.equal((await pruneBackups(f.root,new Date(now.getTime()+7*DAY+1))).removed,1);
  await fs.writeFile(path.join(f.root,'unmanaged'),'keep');const name='backup-20261023T000000000Z-abcdefabcdef';await fs.symlink(f.dir,path.join(f.root,name));
  assert.equal((await pruneBackups(f.root,new Date(now.getTime()+8*DAY))).rejected,1);assert.equal(await fs.readFile(path.join(f.root,'unmanaged'),'utf8'),'keep');
 }finally{await f.close();}
});
test('rejects traversal or expiry tampering in a manifest rather than copying/deleting unrelated files',async()=>{
 const f=await fixture();try{
  await createBackup(f,'automatic',now);const id=(await names(f))[0],file=path.join(f.root,id,'manifest.json'),m=JSON.parse(await fs.readFile(file,'utf8'));
  m.media[0].name='../family.sqlite';await fs.writeFile(file,JSON.stringify(m));await assert.rejects(verifyBackup(f.root,id));assert.equal((await pruneBackups(f.root,new Date(now.getTime()+8*DAY))).rejected,1);
 }finally{await f.close();}
});
test('stops all known writers and resumes only originally running services even when the backup fails',async()=>{
 const f=await fixture();const calls=[],system={state:u=>u==='lampy-family-admin.service'?'inactive':'active',async stop(u){calls.push('stop '+u);},async start(u){calls.push('start '+u);}};
 try{
  await assert.rejects(maintenance('automatic',f,{state:f.state,owner,system,now,perform:async()=>{assert.equal(calls.filter(c=>c.startsWith('stop ')).length,4);throw Error('secret failure');}}));
  assert.deepEqual(calls.slice(-2),['start lampy-family.service','start lampy-family-cleanup.timer']);assert.equal(await fs.stat(path.join(f.state,'resume.json')).then(()=>true).catch(()=>false),false);
  const status=await fs.readFile(path.join(f.state,'backup-status.json'),'utf8');assert.match(status,/BACKUP_FAILED/);assert.doesNotMatch(status,/secret/);
 }finally{await f.close();}
});
test('an unrelated invocation cannot resume another active job; failed restarts retain a retryable plan',async()=>{
 const f=await fixture();try{
  await fs.writeFile(path.join(f.state,'resume.json'),JSON.stringify({owner,units:['lampy-family.service']}));let starts=0;
  await resume(f.state,{async start(){starts++;}},'b'.repeat(32));assert.equal(starts,0);
  await assert.rejects(resume(f.state,{async start(){throw Error('failed');}},owner));assert.ok(await fs.stat(path.join(f.state,'resume.json')));
  await resume(f.state,{async start(){starts++;}},owner);assert.equal(starts,1);
 }finally{await f.close();}
});
test('failed stopping still restarts services and validates manual maintenance arguments',async()=>{
 const f=await fixture();try{
  let starts=0;const system={state:()=> 'active',async stop(){throw Error('stop failed');},async start(){starts++;}};
  await assert.rejects(maintenance('manual',f,{state:f.state,owner,system,now}));assert.equal(starts,3);
  await assert.rejects(maintenance('arbitrary',f,{state:f.state,owner,system,now}));
 }finally{await f.close();}
});
test('cleans stale rehearsal copies but keeps unrelated paths and symlinks',async()=>{
 const f=await fixture();try{
  const old=path.join(f.checkRoot,'rehearsal-Abc123');await fs.mkdir(old);await fs.utimes(old,new Date(0),new Date(0));await fs.symlink(f.dir,path.join(f.checkRoot,'rehearsal-Def456'));
  await pruneChecks(f.checkRoot,now);assert.deepEqual(await fs.readdir(f.checkRoot),['rehearsal-Def456']);
 }finally{await f.close();}
});
test('collector never forwards raw logs, errors, URLs, identities, tokens or arbitrary JSON',()=>{
 const row={_SYSTEMD_UNIT:'lampy-family.service',__REALTIME_TIMESTAMP:String(now.getTime()*1000),MESSAGE:JSON.stringify({event:'SERVICE_STARTED',token:'secret',note:'private text',url:'https://private'})};
 const result=collect({now,states:{'lampy-family.service':'secret-state'},backup:{event:'BACKUP_FAILED',lastSuccess:'private-date',files:'private',path:'/secret'},entries:[row,{...row,MESSAGE:'Error secret-token /private/path'}, {...row,_SYSTEMD_UNIT:'unrelated.service',MESSAGE:'secret'}]});
 assert.equal(result.logs.length,2);assert.equal(result.logs[0].event,'SERVICE_STARTED');assert.equal(result.units[0].state,'unknown');assert.doesNotMatch(JSON.stringify(result),/secret|private|https|token|url|note|path/);
});
test('backup and verification remain compatible with schema 34 without applying any migration',async()=>{
 const f=await fixture();try{f.db.exec('INSERT INTO family_schema_migrations VALUES(34); ALTER TABLE private_rows ADD COLUMN content_purged_at TEXT;');await createBackup(f,'manual',now);assert.equal((await verifyBackup(f.root,(await names(f))[0])).schema,34);}finally{await f.close();}
});
