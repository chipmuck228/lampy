import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openFamilySqliteDatabase} from './node-db';
import {applyFamilyApiSchema,type FamilySql} from './schema';
import {runFamilyDataRetention} from './data-retention';
import {drainRetiredMediaBatch} from './account-deletion';
import {createSqliteFamilyRepository} from './sqlite-repository';
import {createMemoryMediaBlobStore} from './media-blobs';
import {createFamilyCommands} from './commands';
import {createMapAppleVerifier} from './apple';
import {sampleJpegBytes} from './media-validate';
import {reviewSafetyReport,restrictReportedAuthor} from './safety-commands';
const at='2026-10-22T00:00:00.000Z', day=86400000;
const ago=(days:number)=>new Date(Date.parse(at)-days*day).toISOString();
let db:FamilySql,dir:string;
beforeEach(async()=>{dir=await mkdtemp(path.join(tmpdir(),'lampy-retention-'));db=openFamilySqliteDatabase(path.join(dir,'f.sqlite'));await applyFamilyApiSchema(db);});
afterEach(async()=>{await db.close();await rm(dir,{recursive:true,force:true});});
const scalar=async(sql:string)=>Number((await db.getFirst<{n:number}>(sql))!.n);
async function report(id:string,status='pending',anchor?:string){
 const r={reportId:id,reporterUserId:'a',authorUserId:'b',familyId:'f',shareId:'s',reason:'privacy',detail:'private report text',createdAt:ago(200),status,...(anchor?{retentionStartedAt:anchor}:{})};
 await db.run('INSERT INTO family_safety_reports VALUES(?,?,?,?,?,?)',[id,'a','b','s',r.createdAt,JSON.stringify(r)]);return r;
}
it('removes expired/invalid auth data and day-old buckets, keeping effective windows and valid sessions',async()=>{
 await db.run("INSERT INTO family_sessions VALUES('expired','u',?),('live','u',?),('invalid','u','bad')",[at,ago(-1)]);
 await db.run("INSERT INTO family_apple_challenges(id,nonce,intent,expires_at) VALUES('old','old','login',?),('live','live','login',?)",[at,ago(-1)]);
 await db.run("INSERT INTO family_auth_rate_limits VALUES('old-ip',?,4),('recent-ip',?,4)",[ago(1),ago(1/24)]);
 const result=await runFamilyDataRetention(db,new Date(at));
 expect(result).toMatchObject({sessions:2,challenges:1,rateBuckets:1});
 expect(await db.getAll('SELECT token FROM family_sessions')).toEqual([{token:'live'}]);
 expect(await db.getAll('SELECT bucket FROM family_auth_rate_limits')).toEqual([{bucket:'recent-ip'}]);
 expect(JSON.stringify(result)).not.toMatch(/old-ip|recent-ip|expired|live/);
});
it('uses processing time, keeps pending reports, removes receipts, and never lifts enforcement when audits expire',async()=>{
 await report('expired','restricted',ago(90));await report('recent','reviewed',ago(89));await report('pending');
 await db.run("INSERT INTO family_idempotency VALUES('a','safety-report','req','hash',201,?)",[JSON.stringify({reportId:'expired'})]);
 const repo=createSqliteFamilyRepository(db);
 await repo.withTransaction(async tx=>{
  await tx.saveModeration({shareId:'s',hidden:true,operator:'private-operator',reason:'private reason',updatedAt:ago(180)});
  await tx.saveSharingRestriction({userId:'b',restricted:true,operator:'private-operator',reason:'private reason',updatedAt:ago(180)});
 });
 const result=await runFamilyDataRetention(db,new Date(at));
 expect(result).toMatchObject({resolvedReports:1,moderationAudit:1,restrictionAudit:1,minimizedDecisions:2,overduePendingReports:1});
 expect(await scalar('SELECT COUNT(*) AS n FROM family_idempotency')).toBe(0);
 expect((await db.getAll<{report_id:string}>('SELECT report_id FROM family_safety_reports ORDER BY report_id')).map(r=>r.report_id)).toEqual(['pending','recent']);
 await repo.withTransaction(async tx=>{expect(await tx.findModeration('s')).toMatchObject({hidden:true,reason:'',operator:''});expect(await tx.findSharingRestriction('b')).toMatchObject({restricted:true,reason:''});});
});
async function shares(){
 let now=new Date(ago(40));const blobs=createMemoryMediaBlobStore();
 const build=()=>createFamilyCommands({repository:createSqliteFamilyRepository(db),mediaBlobs:blobs,apple:createMapAppleVerifier({a:{appleSubject:'a'}}),clock:{now:()=>now},historySharingEnabled:true});
 const commands=build(),a=await commands.signInWithApple('a'),f=await commands.createNamedFamily(a.sessionToken,'Home','one'),other=await commands.createNamedFamily(a.sessionToken,'Other','two');
 const photo=await commands.uploadMedia(a.sessionToken,{bytes:sampleJpegBytes(),mimeType:'image/jpeg',idempotencyKey:'photo'});
 const input={sourceMomentId:'source',sourceRevision:1,note:'private original',emotion:'calm',occurredAtPrecision:'unknown',mediaObjectIds:[photo.objectId],expectedMediaCount:1,audienceConfirmation:'new-members-can-read-active-history',idempotencyKey:'share'};
 const first=await commands.historyShares.shareMoment(a.sessionToken,f.familyId,input),second=await commands.historyShares.shareMoment(a.sessionToken,other.familyId,{...input,idempotencyKey:'other-share'});
 now=new Date(ago(30));await commands.historyShares.revokeShare(a.sessionToken,f.familyId,first.shareId);
 return {commands,a,f,other,photo,input,first,second,blobs,setNow:(date:string)=>{now=new Date(date);}};
}
it('retires snapshots/replay copies at day 30 without deleting media in another family or resurrecting a revision',async()=>{
 const x=await shares();
 expect((await runFamilyDataRetention(db,new Date(Date.parse(at)-1))).retiredShares).toBe(0);
 expect(await runFamilyDataRetention(db,new Date(at))).toMatchObject({retiredShares:1,retiredMedia:0});
 const tombstone=await db.getFirst<{snapshot_json:string;audience_json:string;content_purged_at:string}>('SELECT snapshot_json,audience_json,content_purged_at FROM family_shares WHERE share_id=?',[x.first.shareId]);
 expect(JSON.parse(tombstone!.snapshot_json)).toMatchObject({note:'',emotion:'',media:[]});expect(tombstone!.audience_json).toBe('[]');expect(tombstone!.content_purged_at).toBe(at);
 expect(JSON.stringify(await db.getAll("SELECT body_json FROM family_idempotency WHERE command LIKE 'shareMoment%'"))).not.toContain(x.first.shareId);
 expect(x.blobs.files.has(x.photo.objectId)).toBe(true);
 // Sign in after retention removes the expired session.
 x.a=await x.commands.signInWithApple('a');
 await expect(x.commands.historyShares.getShare(x.a.sessionToken,x.f.familyId,x.first.shareId)).rejects.toBeTruthy();
 await expect(x.commands.historyShares.shareMoment(x.a.sessionToken,x.f.familyId,x.input)).rejects.toMatchObject({code:'CONFLICT'});
 expect((await x.commands.historyShares.getShareMediaContent(x.a.sessionToken,x.other.familyId,x.second.shareId,x.photo.objectId)).bytes).toEqual(sampleJpegBytes());
});
it('queues bytes before retirement, survives file-delete failure/reopen and cannot serve a retired object',async()=>{
 const x=await shares();await x.commands.historyShares.revokeShare(x.a.sessionToken,x.other.familyId,x.second.shareId);
 expect(await runFamilyDataRetention(db,new Date(at))).toMatchObject({retiredShares:2,retiredMedia:1});
 const repo=createSqliteFamilyRepository(db);
 expect(await drainRetiredMediaBatch(repo,{...x.blobs,remove:async()=>{throw Error('disk');}})).toMatchObject({failed:1,pendingBatch:1});
 await expect(x.commands.getMediaContent(x.a.sessionToken,x.photo.objectId)).rejects.toBeTruthy();
 await db.close();db=openFamilySqliteDatabase(path.join(dir,'f.sqlite'));
 expect(await drainRetiredMediaBatch(createSqliteFamilyRepository(db),x.blobs)).toMatchObject({removed:1,failed:0,pendingBatch:0});expect(x.blobs.files.size).toBe(0);
});
it('rolls back retirement and its durable deletion queue together if any SQL write fails',async()=>{
 const x=await shares();await x.commands.historyShares.revokeShare(x.a.sessionToken,x.other.familyId,x.second.shareId);
 const broken={...db,run:async(sql:string,args?:unknown[])=>{if(sql.startsWith('DELETE FROM family_media_objects'))throw Error('disk');return db.run(sql,args);}};
 await expect(runFamilyDataRetention(broken,new Date(at))).rejects.toThrow('disk');
 expect(await db.getFirst('SELECT object_id FROM family_media_objects WHERE object_id=?',[x.photo.objectId])).not.toBeNull();
 expect(await scalar('SELECT COUNT(*) AS n FROM family_account_media_cleanup')).toBe(0);
 expect(await scalar('SELECT COUNT(*) AS n FROM family_shares WHERE content_purged_at IS NOT NULL')).toBe(0);
 expect(x.blobs.files.size).toBe(1);
});
it('migration 34 preserves pending reports and starts a grace period for historical resolved reports atomically',async()=>{
 await db.close();db=openFamilySqliteDatabase(path.join(dir,'old.sqlite'));await applyFamilyApiSchema(db,{upTo:33});
 await report('closed','reviewed');await report('open');
 const broken={...db,run:async(sql:string,args?:unknown[])=>{if(sql.includes('family_schema_migrations')&&args?.[0]===34)throw Error('disk');return db.run(sql,args);}};
 await expect(applyFamilyApiSchema(broken)).rejects.toThrow('disk');
 expect((await db.getAll<{name:string}>('PRAGMA table_info(family_shares)')).map(r=>r.name)).not.toContain('content_purged_at');
 expect(JSON.parse((await db.getFirst<{json:string}>("SELECT json FROM family_safety_reports WHERE report_id='closed'"))!.json).retentionStartedAt).toBeUndefined();
 const before=Date.now();await applyFamilyApiSchema(db);
 const closed=JSON.parse((await db.getFirst<{json:string}>("SELECT json FROM family_safety_reports WHERE report_id='closed'"))!.json);
 expect(Date.parse(closed.retentionStartedAt)).toBeGreaterThanOrEqual(before-1);
 expect((await runFamilyDataRetention(db,new Date())).resolvedReports).toBe(0);
});
it('new reviews stamp the anchor without treating an author restriction as report resolution',async()=>{
 await report('r');await db.run("INSERT INTO family_accounts VALUES('b',NULL,NULL,?)",[at]);
 const repo=createSqliteFamilyRepository(db);
 await repo.withTransaction(async tx=>{await reviewSafetyReport(tx,{reportId:'r',operator:'op',reason:'reviewed',hide:false,now:ago(1)});await restrictReportedAuthor(tx,{reportId:'r',operator:'op',reason:'restricted',restricted:true,now:at});});
 expect(JSON.parse((await db.getFirst<{json:string}>("SELECT json FROM family_safety_reports WHERE report_id='r'"))!.json)).toMatchObject({retentionStartedAt:ago(1),status:'reviewed'});
});
it('bounded batches can be resumed and reject unmigrated schemas',async()=>{
 for(let n=0;n<3;n++)await db.run('INSERT INTO family_sessions VALUES(?,?,?)',[`token${n}`,'u',ago(1)]);
 expect((await runFamilyDataRetention(db,new Date(at),2)).sessions).toBe(2);expect((await runFamilyDataRetention(db,new Date(at),2)).sessions).toBe(1);
 await db.run('DELETE FROM family_schema_migrations WHERE version=34');await expect(runFamilyDataRetention(db,new Date(at))).rejects.toThrow('schema 34');
});
it('retires a hidden share at day thirty while keeping its enforcement tombstone and pending report',async()=>{
 const x=await shares();
 await createSqliteFamilyRepository(db).withTransaction(tx=>tx.saveModeration({shareId:x.second.shareId,hidden:true,operator:'op',reason:'rule',updatedAt:ago(30)}));
 await report('pending');
 expect(await runFamilyDataRetention(db,new Date(at))).toMatchObject({retiredShares:2,retiredMedia:1});
 const moderation=await createSqliteFamilyRepository(db).withTransaction(tx=>tx.findModeration(x.second.shareId));expect(moderation?.hidden).toBe(true);
 expect(await scalar('SELECT COUNT(*) AS n FROM family_safety_reports')).toBe(1);
 x.a=await x.commands.signInWithApple('a');
 await expect(x.commands.historyShares.getShare(x.a.sessionToken,x.other.familyId,x.second.shareId)).rejects.toBeTruthy();
});
it('keeps a fresh unreferenced upload and reclaims an abandoned one after a full day',async()=>{
 const blobs=createMemoryMediaBlobStore(),repo=createSqliteFamilyRepository(db);
 const commands=createFamilyCommands({repository:repo,mediaBlobs:blobs,apple:createMapAppleVerifier({a:{appleSubject:'a'}}),clock:{now:()=>new Date(ago(1))}});
 const a=await commands.signInWithApple('a');const old=await commands.uploadMedia(a.sessionToken,{bytes:sampleJpegBytes(),mimeType:'image/jpeg',idempotencyKey:'old'});
 expect((await runFamilyDataRetention(db,new Date(Date.parse(at)-1))).retiredMedia).toBe(0);
 expect((await runFamilyDataRetention(db,new Date(at))).retiredMedia).toBe(1);
 expect(await scalar("SELECT COUNT(*) AS n FROM family_idempotency WHERE command='uploadMedia'")).toBe(0);
 expect(blobs.files.has(old.objectId)).toBe(true);expect((await drainRetiredMediaBatch(repo,blobs)).removed).toBe(1);
});

it('expires only completed file-deletion receipts, retaining all retry keys',async()=>{
 await db.run("INSERT INTO family_media_cleanup(storage_key,object_id,family_id,completed_at) VALUES('old','o1','f',?),('recent','o2','f',?),('pending','o3','f',NULL)",[ago(30),ago(29)]);
 await db.run("INSERT INTO family_media_cleanup_families VALUES('old','f'),('recent','f'),('pending','f')");
 expect((await runFamilyDataRetention(db,new Date(at))).completedMediaReceipts).toBe(1);
 expect(await db.getAll('SELECT storage_key FROM family_media_cleanup ORDER BY storage_key')).toEqual([{storage_key:'pending'},{storage_key:'recent'}]);
 expect(await db.getAll('SELECT storage_key FROM family_media_cleanup_families ORDER BY storage_key')).toEqual([{storage_key:'pending'},{storage_key:'recent'}]);
});
