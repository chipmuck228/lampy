import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFamilyCommands } from './commands';
import { createMapAppleVerifier } from './apple';
import { createFamilyStore } from './store';
import { createMemoryFamilyRepository } from './repository';
import { createSqliteFamilyRepository } from './sqlite-repository';
import { openFamilySqliteDatabase } from './node-db';
import { applyFamilyApiSchema, type FamilySql } from './schema';
import { HISTORY_CONFIRMATION } from './history-policy';
import { FAMILY_ALBUM_CONFIRMATION } from './family-album-types';
import { sampleJpegBytes } from './media-validate';
import { restrictReportedAuthor, reviewSafetyReport } from './safety-commands';
import { dispatchFamilyApi } from './http';

for (const engine of ['memory','sqlite']) describe('family safety '+engine,()=>{
 let db: FamilySql|undefined,dir:string|undefined;
 async function fixture() {
  if(engine==='sqlite') {dir=await mkdtemp(path.join(tmpdir(),'lampy-safety-'));db=openFamilySqliteDatabase(path.join(dir,'family.sqlite'));await applyFamilyApiSchema(db);}
  const repository=db?createSqliteFamilyRepository(db):createMemoryFamilyRepository(createFamilyStore());
  const commands=createFamilyCommands({repository,apple:createMapAppleVerifier({a:{appleSubject:'a'},b:{appleSubject:'b'},c:{appleSubject:'c'}}),historySharingEnabled:true,inviteLinksEnabled:true,familyAlbumsEnabled:true});
  const a=await commands.signInWithApple('a'), b=await commands.signInWithApple('b'),c=await commands.signInWithApple('c');
  const family=await commands.createNamedFamily(a.sessionToken,'Home','home');
  for(const member of [b,c]){const invite=await commands.createInviteLink(a.sessionToken,family.familyId);await commands.acceptInviteLink(member.sessionToken,invite.token);}
  const photo=await commands.uploadMedia(b.sessionToken,{bytes:sampleJpegBytes(),mimeType:'image/jpeg'});
  const share=await commands.historyShares.shareMoment(b.sessionToken,family.familyId,{sourceMomentId:'m',sourceRevision:1,note:'private family text',emotion:'',occurredAtPrecision:'unknown',mediaObjectIds:[photo.objectId],expectedMediaCount:1,audienceConfirmation:HISTORY_CONFIRMATION});
  const access=await commands.albums.access(a.sessionToken,family.familyId);await commands.albums.acknowledge(a.sessionToken,family.familyId,access.membershipId,FAMILY_ALBUM_CONFIRMATION);
  let album=await commands.albums.create(a.sessionToken,family.familyId,{authority:access.authority,requestId:'book',name:'Book',opening:null});
  album=await commands.albums.mutate(a.sessionToken,family.familyId,album.albumId,{authority:album.access.authority,revision:album.revision,change:{kind:'collect',shareIds:[share.shareId]}});
  return {repository,commands,a,b,c,family,photo,share,album};
 }
 afterEach(async()=>{await db?.close();if(dir)await rm(dir,{recursive:true,force:true});db=undefined;dir=undefined;});
 it('issues private receipts, deduplicates, rejects conflicting idempotency and outsider/own/invalid reports',async()=>{
  const f=await fixture();const input={requestId:'r1',reason:'privacy' as const,detail:'please review'};
  const receipt=await f.commands.safety.report(f.a.sessionToken,f.family.familyId,f.share.shareId,input);
  expect(receipt.status).toBe('pending');expect(JSON.stringify(receipt)).not.toContain('private family text');
  expect(await f.commands.safety.report(f.a.sessionToken,f.family.familyId,f.share.shareId,input)).toEqual(receipt);
  expect(await f.commands.safety.report(f.a.sessionToken,f.family.familyId,f.share.shareId,{...input,requestId:'r2'})).toEqual(receipt);
  await expect(f.commands.safety.report(f.a.sessionToken,f.family.familyId,f.share.shareId,{...input,reason:'other'})).rejects.toMatchObject({code:'CONFLICT'});
  expect((await f.commands.safety.reports(f.c.sessionToken)).reports).toEqual([]);
  await expect(f.commands.safety.report(f.b.sessionToken,f.family.familyId,f.share.shareId,input)).rejects.toMatchObject({code:'BAD_REQUEST'});
  await expect(f.commands.safety.report(f.a.sessionToken,'foreign',f.share.shareId,input)).rejects.toMatchObject({code:'NOT_IN_FAMILY'});
  const response=await dispatchFamilyApi(f.commands,{method:'GET',path:'/v2/me/safety/reports',headers:{}});expect(response.status).toBe(401);
 });
 it('filters shares, media, manual/automatic covers and invalidates old album digest only for blocker',async()=>{
  const f=await fixture();expect(f.album.cover?.objectId).toBe(f.photo.objectId);
  await f.commands.safety.block(f.a.sessionToken,f.family.familyId,f.b.userId);
  expect((await f.commands.historyShares.listVisibleShares(f.a.sessionToken,f.family.familyId)).shares).toEqual([]);
  await expect(f.commands.historyShares.getShareMediaContent(f.a.sessionToken,f.family.familyId,f.share.shareId,f.photo.objectId)).rejects.toMatchObject({code:'FORBIDDEN'});
  expect((await f.commands.historyShares.getShare(f.c.sessionToken,f.family.familyId,f.share.shareId)).shareId).toBe(f.share.shareId);
  await expect(f.commands.albums.validate(f.a.sessionToken,f.family.familyId,f.album.albumId,f.album.validation)).rejects.toMatchObject({code:'FAMILY_ALBUM_CHANGED'});
  const hidden=await f.commands.albums.read(f.a.sessionToken,f.family.familyId,f.album.albumId);expect(hidden.cover).toBeNull();expect(hidden.items).toEqual([{shareId:f.share.shareId,status:'withdrawn'}]);
  expect((await f.commands.albums.list(f.a.sessionToken,f.family.familyId)).albums[0].cover).toBeNull();
  expect((await f.commands.albums.sources(f.a.sessionToken,f.family.familyId)).shares).toEqual([]);
  await f.commands.safety.unblock(f.a.sessionToken,f.b.userId);
  expect((await f.commands.albums.read(f.a.sessionToken,f.family.familyId,f.album.albumId)).cover?.objectId).toBe(f.photo.objectId);
 });
 it('operator restriction affects all readers, never restores revoked content, and purge removes identities and reports',async()=>{
  const f=await fixture();const r=await f.commands.safety.report(f.a.sessionToken,f.family.familyId,f.share.shareId,{requestId:'review',reason:'other',detail:''});
  await f.repository.withTransaction(tx=>reviewSafetyReport(tx,{reportId:r.reportId,operator:'host-operator',reason:'reviewed harmful content',hide:true,now:new Date().toISOString()}));
  expect((await f.commands.safety.reports(f.a.sessionToken)).reports[0].status).toBe('restricted');
  await expect(f.commands.historyShares.getShare(f.c.sessionToken,f.family.familyId,f.share.shareId)).rejects.toMatchObject({code:'FORBIDDEN'});
  await f.commands.safety.block(f.a.sessionToken,f.family.familyId,f.b.userId);
  await f.repository.withTransaction(tx=>tx.purgeAccount(f.b.userId));
  expect((await f.commands.safety.reports(f.a.sessionToken)).reports).toEqual([]);expect((await f.commands.safety.blocks(f.a.sessionToken)).blocks).toEqual([]);
 });
 it('restricts future sharing by the reported author, preserves reading and supports an audited release',async()=>{
  const f=await fixture();const report=await f.commands.safety.report(f.a.sessionToken,f.family.familyId,f.share.shareId,{requestId:'restrict-author',reason:'harassment',detail:''});
  const input={reportId:report.reportId,operator:'developer',reason:'reviewed',now:new Date().toISOString()};
  await f.repository.withTransaction(tx=>restrictReportedAuthor(tx,{...input,restricted:true}));
  const share={sourceMomentId:'next',sourceRevision:1,note:'ordinary text',emotion:'',occurredAtPrecision:'unknown',mediaObjectIds:[],expectedMediaCount:0,audienceConfirmation:HISTORY_CONFIRMATION};
  await expect(f.commands.historyShares.shareMoment(f.b.sessionToken,f.family.familyId,share)).rejects.toMatchObject({code:'SHARING_RESTRICTED'});
  expect((await f.commands.historyShares.listVisibleShares(f.b.sessionToken,f.family.familyId)).shares).toHaveLength(1);
  expect((await f.commands.safety.reports(f.b.sessionToken)).sharingRestricted).toBe(true);
  await f.repository.withTransaction(tx=>reviewSafetyReport(tx,{...input,hide:true}));
  const notice=await f.commands.safety.reports(f.b.sessionToken);expect(notice.restrictedShares).toEqual([f.share.shareId]);expect(notice.reports).toEqual([]);expect(JSON.stringify(notice)).not.toContain(f.a.userId);
  await f.repository.withTransaction(tx=>restrictReportedAuthor(tx,{...input,restricted:false}));
  expect((await f.commands.historyShares.shareMoment(f.b.sessionToken,f.family.familyId,share)).snapshot.note).toBe('ordinary text');
  await f.repository.withTransaction(tx=>tx.purgeAccount(f.b.userId));
  expect(await f.repository.withTransaction(tx=>tx.findSharingRestriction(f.b.userId))).toBeNull();
 });
 it('filters prohibited shared text without saving shares, profiles, family names or album changes',async()=>{
  const f=await fixture();
  await expect(f.commands.historyShares.shareMoment(f.b.sessionToken,f.family.familyId,{sourceMomentId:'bad',sourceRevision:1,note:'I will kill you',emotion:'',occurredAtPrecision:'unknown',mediaObjectIds:[],expectedMediaCount:0,audienceConfirmation:HISTORY_CONFIRMATION})).rejects.toMatchObject({code:'CONTENT_NOT_ALLOWED'});
  expect((await f.commands.historyShares.listVisibleShares(f.a.sessionToken,f.family.familyId)).shares).toHaveLength(1);
  await expect(f.commands.updateMyProfile(f.b.sessionToken,'杀了你')).rejects.toMatchObject({code:'CONTENT_NOT_ALLOWED'});
  await expect(f.commands.createNamedFamily(f.b.sessionToken,'杀了你','bad-name')).rejects.toMatchObject({code:'CONTENT_NOT_ALLOWED'});
  await expect(f.commands.albums.create(f.a.sessionToken,f.family.familyId,{authority:f.album.access.authority,requestId:'bad-book',name:'Book',opening:'杀了你'})).rejects.toMatchObject({code:'CONTENT_NOT_ALLOWED'});
 });
 it('can hide retained shares from an author who has already left the family',async()=>{
  const f=await fixture();const membership=await f.repository.withTransaction(tx=>tx.findActiveMembership(f.family.familyId,f.b.userId));
  await f.commands.leaveSelectedFamily(f.b.sessionToken,f.family.familyId,membership!.membershipId);
  expect((await f.commands.historyShares.listVisibleShares(f.a.sessionToken,f.family.familyId)).shares).toHaveLength(1);
  await f.commands.safety.block(f.a.sessionToken,f.family.familyId,f.b.userId);
  expect((await f.commands.historyShares.listVisibleShares(f.a.sessionToken,f.family.familyId)).shares).toEqual([]);
 });
 it('limits report flooding and applies account blocks across families without changing membership',async()=>{
  const f=await fixture();
  await expect(f.commands.safety.block(f.a.sessionToken,f.family.familyId,f.a.userId)).rejects.toMatchObject({code:'BAD_REQUEST'});
  for(let i=0;i<11;i++) {
   const share=await f.commands.historyShares.shareMoment(f.b.sessionToken,f.family.familyId,{sourceMomentId:'spam_'+i,sourceRevision:1,note:'text',emotion:'',occurredAtPrecision:'unknown',mediaObjectIds:[],expectedMediaCount:0,audienceConfirmation:HISTORY_CONFIRMATION});
   const pending=f.commands.safety.report(f.a.sessionToken,f.family.familyId,share.shareId,{requestId:'rate_'+i,reason:'other',detail:''});
   if(i<10)await pending;else await expect(pending).rejects.toMatchObject({code:'RATE_LIMITED'});
  }
  const other=await f.commands.createNamedFamily(f.b.sessionToken,'Other','other');const invite=await f.commands.createInviteLink(f.b.sessionToken,other.familyId);await f.commands.acceptInviteLink(f.a.sessionToken,invite.token);
  const share=await f.commands.historyShares.shareMoment(f.b.sessionToken,other.familyId,{sourceMomentId:'other',sourceRevision:1,note:'other family',emotion:'',occurredAtPrecision:'unknown',mediaObjectIds:[],expectedMediaCount:0,audienceConfirmation:HISTORY_CONFIRMATION});
  await f.commands.safety.block(f.a.sessionToken,f.family.familyId,f.b.userId);
  await expect(f.commands.historyShares.getShare(f.a.sessionToken,other.familyId,share.shareId)).rejects.toMatchObject({code:'FORBIDDEN'});
  expect((await f.commands.listFamilies(f.a.sessionToken)).families).toHaveLength(2);
 });
});

it('migration 33 rolls back all safety tables on a failed migration marker',async()=>{
 const db=openFamilySqliteDatabase(':memory:');
 try {await applyFamilyApiSchema(db,{upTo:32});
  await expect(applyFamilyApiSchema({...db,run:async(sql,args)=>{if(sql.includes('family_schema_migrations')&&args?.[0]===33)throw Error('disk full');return db.run(sql,args);}})).rejects.toThrow('disk full');
  expect(await db.getFirst("SELECT name FROM sqlite_master WHERE name='family_safety_reports'")).toBeNull();
  await applyFamilyApiSchema(db);await applyFamilyApiSchema(db);
  expect(await db.getFirst('SELECT MAX(version) AS version FROM family_schema_migrations')).toEqual({version:33});
 } finally {await db.close();}
});
