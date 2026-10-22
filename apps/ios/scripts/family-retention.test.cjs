'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite'),ts=require('typescript');
const {inspect}=require('./family-retention-probe.cjs');
const root=path.join(__dirname,'../src/family-api');
async function fixture(version=34){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lampy-retention-cli-')),file=path.join(dir,'db.sqlite'),media=path.join(dir,'media');fs.mkdirSync(media);
 const native=new DatabaseSync(file),db={exec:async sql=>native.exec(sql),run:async(sql,args=[])=>({changes:Number(native.prepare(sql).run(...args).changes)}),getFirst:async(sql,args=[])=>native.prepare(sql).get(...args)??null};
 const exported={};new Function('exports',ts.transpileModule(fs.readFileSync(path.join(root,'schema.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exported);
 await exported.applyFamilyApiSchema(db,{upTo:version});return {dir,file,media,native,close(){native.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
test('probe accepts schemas 33/34, prints counts only and never modifies the database',async()=>{
 for(const version of [33,34]){const f=await fixture(version);try{
  f.native.prepare('INSERT INTO family_sessions VALUES(?,?,?)').run('secret-token','secret-user','2000-01-01T00:00:00Z');
  const before=fs.readFileSync(f.file),result=inspect(f.file);
  assert.equal(result.expiredSessions,1);assert.equal(result.schema,version);assert.doesNotMatch(JSON.stringify(result),/secret|token|user/);assert.deepEqual(fs.readFileSync(f.file),before);
 }finally{f.close();}}
});
test('operational CLI cleans at real time without migration and emits redacted aggregate results',async()=>{
 const f=await fixture();try{
  f.native.prepare('INSERT INTO family_sessions VALUES(?,?,?)').run('secret-token','secret-user','2000-01-01T00:00:00Z');
  f.native.prepare('INSERT INTO family_sessions VALUES(?,?,?)').run('valid-token','secret-user','2099-01-01T00:00:00Z');
  const mediaFile=path.join(f.media,'med_abc'),personalFile=path.join(f.dir,'personal-original');
  fs.writeFileSync(mediaFile,'synthetic retired bytes');fs.writeFileSync(personalFile,'private original');
  f.native.prepare('INSERT INTO family_media_objects VALUES(?,?,?,?,?,?,?)').run('med_abc','secret-user','image/jpeg',23,'fixture-hash','med_abc','2000-01-01T00:00:00Z');
  const child=spawnSync(process.execPath,[path.join(__dirname,'family-api-cleanup.cjs')],{encoding:'utf8',env:{...process.env,LAMPY_FAMILY_DATABASE_PATH:f.file,LAMPY_FAMILY_MEDIA_PATH:f.media}});
  assert.equal(child.status,0,child.stderr);const result=JSON.parse(child.stdout);assert.equal(result.retention.sessions,1);assert.equal(result.mediaCleanup.pending,0);assert.equal(result.retention.retiredMedia,1);assert.equal(result.mediaCleanup.removed,1);assert.equal(fs.existsSync(mediaFile),false);assert.equal(fs.readFileSync(personalFile,'utf8'),'private original');
  assert.doesNotMatch(child.stdout,/secret|valid-token/);assert.deepEqual(f.native.prepare('SELECT token FROM family_sessions').all().map(r=>r.token),['valid-token']);
 }finally{f.close();}
});
test('cleanup refuses schema 33 and clock overrides without migrating or deleting rows',async()=>{
 const f=await fixture(33);try{
  f.native.prepare('INSERT INTO family_sessions VALUES(?,?,?)').run('secret-token','secret-user','2000-01-01T00:00:00Z');
  for(const args of [[],['--now=2099-01-01']]){
   const child=spawnSync(process.execPath,[path.join(__dirname,'family-api-cleanup.cjs'),...args],{encoding:'utf8',env:{...process.env,LAMPY_FAMILY_DATABASE_PATH:f.file,LAMPY_FAMILY_MEDIA_PATH:f.media}});assert.equal(child.status,1);
  }
  assert.equal(f.native.prepare('SELECT MAX(version) AS v FROM family_schema_migrations').get().v,33);assert.equal(f.native.prepare('SELECT COUNT(*) AS n FROM family_sessions').get().n,1);
 }finally{f.close();}
});
test('probe refuses a missing database without creating it',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lampy-retention-no-db-'));try{const file=path.join(dir,'missing');assert.throws(()=>inspect(file));assert.equal(fs.existsSync(file),false);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
