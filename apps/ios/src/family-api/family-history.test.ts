import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFamilyCommands } from './commands';
import { createMapAppleVerifier } from './apple';
import { createMemoryMediaBlobStore } from './media-blobs';
import { sampleJpegBytes, sampleAudioBytes } from './media-validate';
import { openFamilySqliteDatabase } from './node-db';
import { applyFamilyApiSchema, type FamilySql } from './schema';
import { createSqliteFamilyRepository } from './sqlite-repository';
import { HISTORY_CONFIRMATION } from './history-policy';
import { dispatchFamilyApi } from './http';
import type { ShareMomentInput } from './types';

let dir: string, db: FamilySql, commands: ReturnType<typeof createFamilyCommands>;
let now: Date;
const blobs = createMemoryMediaBlobStore();
function build(enabled = true) {
 return createFamilyCommands({repository:createSqliteFamilyRepository(db), mediaBlobs:blobs,
  apple:createMapAppleVerifier({a:{appleSubject:'a'},b:{appleSubject:'b'},c:{appleSubject:'c'}}),
  clock:{now:()=>now},historySharingEnabled:enabled,inviteLinksEnabled:true});
}
const input = (overrides: Partial<ShareMomentInput> = {}): ShareMomentInput => ({
 sourceMomentId:'moment_one',sourceRevision:1,note:'窗边的一天。',emotion:'平静',occurredAtPrecision:'unknown',
 mediaObjectIds:[],expectedMediaCount:0,audienceConfirmation:HISTORY_CONFIRMATION,...overrides,
});
beforeEach(async()=>{
 dir=await mkdtemp(path.join(tmpdir(),'lampy-history-'));db=openFamilySqliteDatabase(path.join(dir,'family.sqlite'));
 await applyFamilyApiSchema(db);now=new Date('2026-10-09T01:00:00Z');commands=build();
});
afterEach(async()=>{await db.close();await rm(dir,{recursive:true,force:true});});

it('migrates existing data as legacy without rewriting snapshots, audience or old migrations; survives reopen',async()=>{
 await db.close();db=openFamilySqliteDatabase(path.join(dir,'old.sqlite'));await applyFamilyApiSchema(db,{upTo:20});
 await db.run("INSERT INTO family_families(family_id,name,created_at,status) VALUES ('old','Old','2026-01-01','active')");
 await db.run("INSERT INTO family_shares(share_id,family_id,author_user_id,source_moment_id,source_revision,snapshot_json,audience_json,shared_at,status) VALUES ('share','old','a','m',1,?,?,'2026-01-01','active')",['{"note":"old"}','["a"]']);
 const before=await db.getAll('SELECT * FROM family_shares');
 await applyFamilyApiSchema(db);await applyFamilyApiSchema(db);
 expect(await db.getAll('SELECT * FROM family_shares')).toEqual(before);
 expect(await db.getFirst("SELECT history_policy,history_confirmed_at FROM family_families WHERE family_id='old'")).toEqual({history_policy:'legacy',history_confirmed_at:null});
 expect(await db.getFirst('SELECT MAX(version) AS version FROM family_schema_migrations')).toEqual({version:23});
 await db.close();db=openFamilySqliteDatabase(path.join(dir,'old.sqlite'));
 expect((await createSqliteFamilyRepository(db).withTransaction(tx=>tx.findFamily('old')))?.historyPolicy).toBe('legacy');
});

it('keeps legacy history restricted until creator confirmation, revokes pending invites and gates old routes',async()=>{
 const a=await commands.signInWithApple('a'),b=await commands.signInWithApple('b');
 const f=await commands.createFamily(a.sessionToken);
 const shared=await commands.shareMoment(a.sessionToken,f.familyId,input());
 now=new Date('2026-10-09T02:00:00Z');
 const invite=await commands.createInviteLink(a.sessionToken,f.familyId);await commands.acceptInviteLink(b.sessionToken,invite.token);
 expect((await commands.listVisibleShares(b.sessionToken,f.familyId)).shares).toEqual([]);
 await expect(commands.historyShares.getShare(b.sessionToken,f.familyId,shared.shareId)).rejects.toMatchObject({code:'FAMILY_POLICY_UPGRADE_REQUIRED'});
 const pending=await commands.createInviteLink(a.sessionToken,f.familyId);
 const oldPending=await commands.inviteMember(a.sessionToken,f.familyId,'old-invite');
 await expect(commands.confirmFamilyHistory(b.sessionToken,f.familyId,HISTORY_CONFIRMATION)).rejects.toMatchObject({code:'FORBIDDEN'});
 await expect(commands.confirmFamilyHistory(a.sessionToken,f.familyId,'')).rejects.toMatchObject({code:'BAD_REQUEST'});
 await commands.confirmFamilyHistory(a.sessionToken,f.familyId,HISTORY_CONFIRMATION);
 expect((await commands.previewInviteLink(pending.token,'peer')).status).toBe('revoked');
 await expect(commands.acceptInvitation(b.sessionToken,oldPending.code)).rejects.toMatchObject({code:'INVITE_REVOKED'});
 expect((await commands.historyShares.getShare(b.sessionToken,f.familyId,shared.shareId)).snapshot.note).toBe('窗边的一天。');
 await expect(commands.getShare(a.sessionToken,f.familyId,shared.shareId)).rejects.toMatchObject({code:'FAMILY_POLICY_UPGRADE_REQUIRED'});
 const family=await createSqliteFamilyRepository(db).withTransaction(tx=>tx.findFamily(f.familyId));
 expect(family?.historyConfirmedBy).toBe(a.userId);
 now=new Date('2026-10-09T03:00:00Z');
 await commands.confirmFamilyHistory(a.sessionToken,f.familyId,HISTORY_CONFIRMATION);
 expect((await createSqliteFamilyRepository(db).withTransaction(tx=>tx.findFamily(f.familyId)))?.historyConfirmedAt).toBe(family?.historyConfirmedAt);
});

it('reads old text, photo and sound only through current family membership; removal, rejoin, revoke and signout take effect',async()=>{
 const a=await commands.signInWithApple('a'),b=await commands.signInWithApple('b'),c=await commands.signInWithApple('c');
 const f=await commands.createNamedFamily(a.sessionToken,'Home','f');
 const photo=await commands.uploadMedia(a.sessionToken,{bytes:sampleJpegBytes(),mimeType:'image/jpeg'});
 const sound=await commands.uploadMedia(a.sessionToken,{bytes:sampleAudioBytes(),mimeType:'audio/mp4'});
 const payload=input({mediaObjectIds:[photo.objectId,sound.objectId],expectedMediaCount:2});
 const shared=await commands.historyShares.shareMoment(a.sessionToken,f.familyId,payload);
 now=new Date('2026-10-09T02:00:00Z');
 const invite=await commands.createInviteLink(a.sessionToken,f.familyId);await commands.acceptInviteLink(b.sessionToken,invite.token);
 expect((await commands.historyShares.listVisibleShares(b.sessionToken,f.familyId)).shares).toHaveLength(1);
 expect((await commands.historyShares.getShareMediaContent(b.sessionToken,f.familyId,shared.shareId,sound.objectId)).bytes).toEqual(sampleAudioBytes());
 await expect(commands.getMediaContent(b.sessionToken,sound.objectId)).rejects.toMatchObject({code:'FORBIDDEN'});
 await expect(commands.historyShares.getShare(c.sessionToken,f.familyId,shared.shareId)).rejects.toMatchObject({code:'NOT_IN_FAMILY'});
 await commands.removeMember(a.sessionToken,f.familyId,b.userId);
 await expect(commands.historyShares.listVisibleShares(b.sessionToken,f.familyId)).rejects.toMatchObject({code:'NOT_IN_FAMILY'});
 await expect(commands.historyShares.getShareMediaContent(b.sessionToken,f.familyId,shared.shareId,photo.objectId)).rejects.toMatchObject({code:'NOT_IN_FAMILY'});
 const again=await commands.createInviteLink(a.sessionToken,f.familyId);await commands.acceptInviteLink(b.sessionToken,again.token);
 expect((await commands.historyShares.getShare(b.sessionToken,f.familyId,shared.shareId)).shareId).toBe(shared.shareId);
 await commands.historyShares.revokeShare(a.sessionToken,f.familyId,shared.shareId);
 expect((await commands.historyShares.listVisibleShares(b.sessionToken,f.familyId)).shares).toEqual([]);
 await expect(commands.historyShares.getShareMedia(b.sessionToken,f.familyId,shared.shareId,sound.objectId)).rejects.toMatchObject({code:'SHARE_NOT_FOUND'});
 await commands.signOut(b.sessionToken);
 await expect(commands.historyShares.getShare(b.sessionToken,f.familyId,shared.shareId)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
});

it('requires snapshot confirmation and complete owned media, deduplicates retries and rejects cross-family/media paths',async()=>{
 const a=await commands.signInWithApple('a'),b=await commands.signInWithApple('b');
 const f=await commands.createNamedFamily(a.sessionToken,'Home','f'),other=await commands.createNamedFamily(a.sessionToken,'Other','g');
 await expect(commands.historyShares.shareMoment(a.sessionToken,f.familyId,input({audienceConfirmation:undefined}))).rejects.toMatchObject({code:'BAD_REQUEST'});
 const media=await commands.uploadMedia(b.sessionToken,{bytes:sampleJpegBytes(),mimeType:'image/jpeg'});
 await expect(commands.historyShares.shareMoment(a.sessionToken,f.familyId,input({mediaObjectIds:[media.objectId],expectedMediaCount:1}))).rejects.toMatchObject({code:'FORBIDDEN'});
 await expect(commands.historyShares.shareMoment(a.sessionToken,f.familyId,input({expectedMediaCount:1}))).rejects.toMatchObject({code:'SHARE_MEDIA_INCOMPLETE'});
 const payload=input({idempotencyKey:'retry'});
 const [first,second]=await Promise.all([commands.historyShares.shareMoment(a.sessionToken,f.familyId,payload),commands.historyShares.shareMoment(a.sessionToken,f.familyId,payload)]);
 expect(first.shareId).toBe(second.shareId);
 await expect(commands.historyShares.shareMoment(a.sessionToken,other.familyId,payload)).rejects.toMatchObject({code:'CONFLICT'});
 await expect(commands.historyShares.shareMoment(a.sessionToken,f.familyId,input({note:'changed',idempotencyKey:'retry'}))).rejects.toMatchObject({code:'CONFLICT'});
 await expect(commands.historyShares.getShare(a.sessionToken,other.familyId,first.shareId)).rejects.toMatchObject({code:'SHARE_NOT_FOUND'});
 await commands.dissolveFamily(a.sessionToken,f.familyId);
 await expect(commands.historyShares.getShare(a.sessionToken,f.familyId,first.shareId)).rejects.toMatchObject({code:'NOT_IN_FAMILY'});
});

it('exposes gated v2 endpoints with strict whitelist and never silently upgrades legacy clients',async()=>{
 const a=await commands.signInWithApple('a');const f=await commands.createNamedFamily(a.sessionToken,'Home','f');
 const request=(method:string,endpoint:string,body?:unknown)=>dispatchFamilyApi(commands,{method,path:endpoint,headers:{authorization:'Bearer '+a.sessionToken},body});
 const base='/v2/families/'+f.familyId;
 expect((await request('POST',base+'/shares',{...input(),people:['private']})).status).toBe(400);
 expect((await request('POST',base+'/shares',{...input(),mediaObjectIds:[7]})).status).toBe(400);
 expect((await request('POST',base+'/shares',input())).status).toBe(200);
 expect((await request('GET','/v1/families/'+f.familyId+'/shares')).status).toBe(409);
 expect((await request('GET',base+'/history-policy')).body).toEqual({policy:'family-history-v2'});
 const closed=build(false);
 const result=await dispatchFamilyApi(closed,{method:'GET',path:base+'/shares',headers:{authorization:'Bearer '+a.sessionToken}});
 expect(result.status).toBe(503);
 expect(closed.health().familyHistoryV2).toBe(false);
});

it('rolls back migration 21 and policy/invite changes together on a write failure',async()=>{
 await db.close();db=openFamilySqliteDatabase(path.join(dir,'migration.sqlite'));await applyFamilyApiSchema(db,{upTo:20});
 await expect(applyFamilyApiSchema({...db,exec:async sql=>{if(sql.includes('history_confirmed_at')){await db.exec("ALTER TABLE family_families ADD COLUMN history_policy TEXT NOT NULL DEFAULT 'legacy'");throw new Error('disk full');}await db.exec(sql);}})).rejects.toThrow('disk full');
 expect(await db.getFirst('SELECT version FROM family_schema_migrations WHERE version=21')).toBeNull();
 expect((await db.getAll<{name:string}>('PRAGMA table_info(family_families)')).map(r=>r.name)).not.toContain('history_policy');
 await applyFamilyApiSchema(db);commands=build();
 const a=await commands.signInWithApple('a');const f=await commands.createFamily(a.sessionToken);
 const invite=await commands.createInviteLink(a.sessionToken,f.familyId);
 const repository=createSqliteFamilyRepository(db);
 const failing=createFamilyCommands({repository:{withTransaction:work=>repository.withTransaction(tx=>work({...tx,saveInviteLink:async()=>{throw new Error('disk full');}}))},
  apple:createMapAppleVerifier({}),clock:{now:()=>now},historySharingEnabled:true});
 await expect(failing.confirmFamilyHistory(a.sessionToken,f.familyId,HISTORY_CONFIRMATION)).rejects.toThrow('disk full');
 expect((await repository.withTransaction(tx=>tx.findFamily(f.familyId)))?.historyPolicy).toBe('legacy');
 expect((await commands.previewInviteLink(invite.token,'peer')).status).toBe('pending');
});

it('commits concurrent v2 confirmations once across two SQLite connections and preserves the policy after reopen',async()=>{
 const a=await commands.signInWithApple('a');const f=await commands.createNamedFamily(a.sessionToken,'Home','f');
 const secondDb=openFamilySqliteDatabase(path.join(dir,'family.sqlite'));
 try {
  const second=createFamilyCommands({repository:createSqliteFamilyRepository(secondDb),mediaBlobs:blobs,apple:createMapAppleVerifier({}),clock:{now:()=>now},historySharingEnabled:true});
  const [one,two]=await Promise.all([commands.historyShares.shareMoment(a.sessionToken,f.familyId,input({idempotencyKey:'one'})),
   second.historyShares.shareMoment(a.sessionToken,f.familyId,input({idempotencyKey:'two'}))]);
  expect(one.shareId).toBe(two.shareId);
  expect(await db.getFirst('SELECT COUNT(*) AS n FROM family_shares')).toEqual({n:1});
 } finally {await secondDb.close();}
 await db.close();db=openFamilySqliteDatabase(path.join(dir,'family.sqlite'));commands=build();
 expect((await commands.getFamilyHistoryPolicy(a.sessionToken,f.familyId)).policy).toBe('family-history-v2');
 expect((await commands.historyShares.listVisibleShares(a.sessionToken,f.familyId)).shares).toHaveLength(1);
 await expect(commands.historyShares.shareMoment(a.sessionToken,f.familyId,input({sourceMomentId:'file:///private/x'}))).rejects.toMatchObject({code:'BAD_REQUEST'});
});

it('E1 targets one family, persists leave, preserves shares and requires a new invitation', async () => {
 const a = await commands.signInWithApple('a'), b = await commands.signInWithApple('b');
 const home = await commands.createNamedFamily(a.sessionToken, 'Home', 'e1-home');
 const other = await commands.createNamedFamily(b.sessionToken, 'Other', 'e1-other');
 const invite = await commands.createInviteLink(a.sessionToken, home.familyId);
 await commands.acceptInviteLink(b.sessionToken, invite.token);
 const photo = await commands.uploadMedia(a.sessionToken, { bytes: sampleJpegBytes(), mimeType: 'image/jpeg' });
 const share = await commands.historyShares.shareMoment(a.sessionToken, home.familyId, input({mediaObjectIds:[photo.objectId],expectedMediaCount:1}));
 const roster = await commands.getFamilyRoster(b.sessionToken, home.familyId);
 const response = await dispatchFamilyApi(commands, {method:'POST', path:`/v2/families/${home.familyId}/leave`, headers:{Authorization:`Bearer ${b.sessionToken}`}, body:{membershipId:roster.membershipId}});
 expect(response.status).toBe(200);
 await commands.leaveSelectedFamily(b.sessionToken, home.familyId, roster.membershipId);
 expect((await commands.listFamilies(b.sessionToken)).families.map(f=>f.familyId)).toEqual([other.familyId]);
 for (const work of [
  () => commands.getFamilyRoster(b.sessionToken, home.familyId),
  () => commands.historyShares.listVisibleShares(b.sessionToken, home.familyId),
  () => commands.historyShares.getShare(b.sessionToken, home.familyId, share.shareId),
  () => commands.historyShares.getShareMedia(b.sessionToken, home.familyId, share.shareId, photo.objectId),
  () => commands.historyShares.getShareMediaContent(b.sessionToken, home.familyId, share.shareId, photo.objectId),
 ]) await expect(work()).rejects.toMatchObject({code:'NOT_IN_FAMILY'});
 expect((await commands.historyShares.getShare(a.sessionToken, home.familyId, share.shareId)).snapshot.note).toBe(input().note);
 await db.close(); db=openFamilySqliteDatabase(path.join(dir,'family.sqlite')); commands=build();
 expect((await commands.listFamilies(b.sessionToken)).families.map(f=>f.familyId)).toEqual([other.familyId]);
 await expect(commands.acceptInviteLink(b.sessionToken, invite.token)).rejects.toBeDefined();
 const fresh = await commands.createInviteLink(a.sessionToken, home.familyId);
 await commands.acceptInviteLink(b.sessionToken, fresh.token);
 expect((await commands.historyShares.getShare(b.sessionToken, home.familyId, share.shareId)).shareId).toBe(share.shareId);
 await expect(commands.leaveSelectedFamily(b.sessionToken, home.familyId, roster.membershipId)).rejects.toMatchObject({code:'CONFLICT'});
});

it('E1 only allows creator removal and rejects stale removal of a rejoined member', async () => {
 const a = await commands.signInWithApple('a'), b = await commands.signInWithApple('b'), c = await commands.signInWithApple('c');
 const f = await commands.createNamedFamily(a.sessionToken, 'Home', 'e1');
 const invite = await commands.createInviteLink(a.sessionToken, f.familyId); await commands.acceptInviteLink(b.sessionToken, invite.token);
 const roster = await commands.getFamilyRoster(a.sessionToken, f.familyId);
 const member = roster.members.find(m=>m.userId===b.userId)!;
 await expect(commands.leaveSelectedFamily(a.sessionToken, f.familyId, roster.membershipId)).rejects.toMatchObject({code:'FORBIDDEN'});
 await expect(commands.removeSelectedMember(a.sessionToken, f.familyId, a.userId, roster.membershipId)).rejects.toMatchObject({code:'FORBIDDEN'});
 await expect(commands.removeSelectedMember(b.sessionToken, f.familyId, a.userId, roster.membershipId)).rejects.toMatchObject({code:'FORBIDDEN'});
 await expect(commands.getFamilyRoster(c.sessionToken, f.familyId)).rejects.toMatchObject({code:'NOT_IN_FAMILY'});
 await commands.removeSelectedMember(a.sessionToken, f.familyId, b.userId, member.membershipId);
 await commands.removeSelectedMember(a.sessionToken, f.familyId, b.userId, member.membershipId);
 await expect(commands.getFamilyHistoryPolicy(b.sessionToken, f.familyId)).rejects.toMatchObject({code:'NOT_IN_FAMILY'});
 await expect(commands.acceptInviteLink(b.sessionToken, invite.token)).rejects.toBeDefined();
 const fresh=await commands.createInviteLink(a.sessionToken, f.familyId);await commands.acceptInviteLink(b.sessionToken, fresh.token);
 await expect(commands.removeSelectedMember(a.sessionToken, f.familyId, b.userId, member.membershipId)).rejects.toMatchObject({code:'CONFLICT'});
 expect((await commands.getFamilyRoster(b.sessionToken, f.familyId)).role).toBe('member');
});
