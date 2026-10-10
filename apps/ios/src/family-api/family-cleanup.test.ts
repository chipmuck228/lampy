import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createFamilyCommands } from './commands';
import { createMapAppleVerifier } from './apple';
import { openFamilySqliteDatabase } from './node-db';
import { applyFamilyApiSchema, type FamilySql } from './schema';
import { createSqliteFamilyRepository } from './sqlite-repository';
import { createMemoryMediaBlobStore } from './media-blobs';
import { sampleJpegBytes } from './media-validate';
import { HISTORY_CONFIRMATION } from './history-policy';
import { runFamilyCleanup } from './family-cleanup';
import { dispatchFamilyApi } from './http';
import type { FamilyTx } from './repository';
let dir: string, db: FamilySql, now: Date;
let blobs: ReturnType<typeof createMemoryMediaBlobStore>, commands: ReturnType<typeof createFamilyCommands>;
const start = '2026-10-10T00:00:00.000Z', deadline = '2026-11-09T00:00:00.000Z';
function build() {
  return createFamilyCommands({ repository: createSqliteFamilyRepository(db), mediaBlobs: blobs,
    apple: createMapAppleVerifier({ a: { appleSubject: 'a' }, b: { appleSubject: 'b' } }), clock: { now: () => now },
    historySharingEnabled: true, inviteLinksEnabled: true });
}
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'lampy-cleanup-')); db = openFamilySqliteDatabase(path.join(dir, 'f.sqlite'));
  await applyFamilyApiSchema(db); now = new Date(start); blobs = createMemoryMediaBlobStore();
  commands = build();
});
afterEach(async () => { await db.close(); await rm(dir, { recursive: true, force: true }); });
async function setup() {
  const a = await commands.signInWithApple('a'), b = await commands.signInWithApple('b');
  const f = await commands.createNamedFamily(a.sessionToken, 'Private family', 'one');
  const invitation = await commands.createInviteLink(a.sessionToken, f.familyId); await commands.acceptInviteLink(b.sessionToken, invitation.token);
  const ar = await commands.getFamilyRoster(a.sessionToken, f.familyId), br = await commands.getFamilyRoster(b.sessionToken, f.familyId);
  const photo = await commands.uploadMedia(a.sessionToken, { bytes: sampleJpegBytes(), mimeType: 'image/jpeg', idempotencyKey: 'upload' });
  const share = (familyId: string, key: string) => commands.historyShares.shareMoment(a.sessionToken, familyId, {
    sourceMomentId: 'personal-source', sourceRevision: 1, note: 'Private original', emotion: '平静', occurredAtPrecision: 'unknown',
    mediaObjectIds: [photo.objectId], expectedMediaCount: 1, audienceConfirmation: HISTORY_CONFIRMATION, idempotencyKey: key });
  const shared = await share(f.familyId, 'snapshot');
  return { a, b, f, ar, br, photo, shared, share };
}
it('creator-only explicit membership, immediate denial, pending invite/transfer invalidation and immutable retry deadline', async () => {
  const x = await setup(); const link = await commands.createInviteLink(x.a.sessionToken, x.f.familyId);
  const transfer = await commands.transfers.create(x.a.sessionToken, x.f.familyId, { requestId: 'transfer', fromMembershipId: x.ar.membershipId, toMembershipId: x.br.membershipId });
  await expect(commands.dissolveFamily(x.b.sessionToken, x.f.familyId, x.br.membershipId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(commands.dissolveFamily(x.a.sessionToken, x.f.familyId, 'stale')).rejects.toMatchObject({ code: 'CONFLICT' });
  const bad = await dispatchFamilyApi(commands, { method: 'POST', path: `/v2/families/${x.f.familyId}/dissolve`, headers: { authorization: `Bearer ${x.a.sessionToken}` }, body: {} });
  expect(bad.status).toBe(400);
  await commands.dissolveFamily(x.a.sessionToken, x.f.familyId, x.ar.membershipId);
  expect(await db.getFirst('SELECT dissolved_at,cleanup_deadline,dissolved_by FROM family_families WHERE family_id=?', [x.f.familyId])).toEqual({ dissolved_at: start, cleanup_deadline: deadline, dissolved_by: x.a.userId });
  expect(await db.getFirst('SELECT status FROM family_creator_transfers WHERE transfer_id=?', [transfer.transferId])).toEqual({ status: 'invalid' });
  expect((await commands.previewInviteLink(link.token, 'peer')).status).not.toBe('pending');
  await expect(commands.acceptInviteLink(x.b.sessionToken, link.token)).rejects.toBeTruthy();
  await expect(commands.transfers.respond(x.b.sessionToken, x.f.familyId, transfer.transferId, 1, 'accept')).rejects.toMatchObject({ code: 'FAMILY_DISSOLVED' });
  await expect(commands.historyShares.getShare(x.b.sessionToken, x.f.familyId, x.shared.shareId)).rejects.toBeTruthy();
  await expect(commands.historyShares.getShareMediaContent(x.a.sessionToken, x.f.familyId, x.shared.shareId, x.photo.objectId)).rejects.toBeTruthy();
  await expect(commands.getMediaContent(x.a.sessionToken, x.photo.objectId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect((await commands.listFamilies(x.a.sessionToken)).families).toHaveLength(0);
  now = new Date('2026-10-11T00:00:00Z'); await commands.dissolveFamily(x.a.sessionToken, x.f.familyId, x.ar.membershipId);
  expect(await db.getFirst('SELECT cleanup_deadline FROM family_families WHERE family_id=?', [x.f.familyId])).toEqual({ cleanup_deadline: deadline });
});
it('waits until deadline, persists across reopen, removes snapshots and replay copies, and never touches personal files', async () => {
  const x = await setup(); await commands.dissolveFamily(x.a.sessionToken, x.f.familyId);
  expect((await runFamilyCleanup(db, blobs, new Date(Date.parse(deadline) - 1))).checked).toBe(0);
  expect(blobs.files.has(x.photo.objectId)).toBe(true);
  await db.close(); db = openFamilySqliteDatabase(path.join(dir, 'f.sqlite')); commands = build();
  expect(await runFamilyCleanup(db, blobs, new Date(deadline))).toMatchObject({ completed: 1, failed: 0, removedFiles: 1 });
  expect(await db.getAll('SELECT * FROM family_shares')).toEqual([]);
  expect(await db.getAll('SELECT * FROM family_media_objects')).toEqual([]);
  expect(JSON.stringify(await db.getAll('SELECT * FROM family_idempotency'))).not.toContain('Private original');
  expect(JSON.stringify(await db.getAll('SELECT * FROM family_idempotency'))).not.toContain('Private family');
  await expect(commands.createNamedFamily(x.a.sessionToken,'Private family','one')).rejects.toMatchObject({code:'FAMILY_DISSOLVED'});
  expect((await commands.listFamilies(x.a.sessionToken)).families).toHaveLength(0);
  await expect(commands.dissolveFamily(x.a.sessionToken,x.f.familyId)).resolves.toEqual({dissolved:true});
  expect(blobs.files.size).toBe(0);
  expect(await runFamilyCleanup(db, blobs, new Date(deadline))).toMatchObject({ checked: 0 });
});
it('preserves media referenced by another active family; cleans it only after that family also reaches its deadline', async () => {
  const x = await setup(); const other = await commands.createNamedFamily(x.a.sessionToken, 'Other', 'two');
  const shared = await x.share(other.familyId, 'second-snapshot');
  await commands.dissolveFamily(x.a.sessionToken, x.f.familyId);
  expect(await runFamilyCleanup(db, blobs, new Date(deadline))).toMatchObject({ completed: 1, removedFiles: 0 });
  expect((await commands.historyShares.getShareMediaContent(x.a.sessionToken, other.familyId, shared.shareId, x.photo.objectId)).bytes).toEqual(sampleJpegBytes());
  await commands.dissolveFamily(x.a.sessionToken, other.familyId);
  expect(await runFamilyCleanup(db, blobs, new Date(deadline))).toMatchObject({ completed: 1, removedFiles: 1 });
});
it('file deletion failure is durable, fails the run, and resumes after reopen without losing the deletion key', async () => {
  const x = await setup(); await commands.dissolveFamily(x.a.sessionToken, x.f.familyId);
  expect(await runFamilyCleanup(db, { ...blobs, remove: async () => { throw new Error('denied'); } }, new Date(deadline))).toMatchObject({ failed: 1, completed: 0 });
  expect(await db.getFirst('SELECT cleaned_at,cleanup_error FROM family_families WHERE family_id=?', [x.f.familyId])).toEqual({ cleaned_at: null, cleanup_error: 'CLEANUP_FAILED' });
  expect(await db.getFirst('SELECT attempts,last_error FROM family_media_cleanup')).toEqual({ attempts: 1, last_error: 'MEDIA_REMOVE_FAILED' });
  expect(blobs.files.has(x.photo.objectId)).toBe(true);
  await db.close(); db = openFamilySqliteDatabase(path.join(dir, 'f.sqlite')); commands = build();
  expect(await runFamilyCleanup(db, blobs, new Date(deadline))).toMatchObject({ failed: 0, completed: 1 });
  expect(blobs.files.has(x.photo.objectId)).toBe(false);
});
it('rolls back an interrupted migration 23 and preserves the previous 22 migrations', async () => {
  await db.close(); db = openFamilySqliteDatabase(path.join(dir, 'old.sqlite')); await applyFamilyApiSchema(db, { upTo: 22 });
  const before = await db.getAll('SELECT * FROM family_schema_migrations');
  await expect(applyFamilyApiSchema({ ...db, run: async (sql, params) => { if (params?.[0] === 23 && sql.includes('family_schema_migrations')) throw new Error('disk'); return db.run(sql, params); } })).rejects.toThrow('disk');
  expect(await db.getFirst("SELECT name FROM sqlite_master WHERE name='family_media_cleanup'")).toBeNull();
  await applyFamilyApiSchema(db);
  expect(await db.getAll('SELECT * FROM family_schema_migrations WHERE version<=22')).toEqual(before);
});

it('serializes dissolution against acceptance and leaves no active members or usable old invitations', async () => {
  const x = await setup(); const link = await commands.createInviteLink(x.a.sessionToken, x.f.familyId);
  const pending = await commands.transfers.create(x.a.sessionToken, x.f.familyId, { requestId:'race',fromMembershipId:x.ar.membershipId,toMembershipId:x.br.membershipId });
  const secondDb = openFamilySqliteDatabase(path.join(dir,'f.sqlite'));
  const second = createFamilyCommands({ repository:createSqliteFamilyRepository(secondDb),mediaBlobs:blobs,apple:createMapAppleVerifier({}),clock:{now:()=>now} });
  try {
    const results = await Promise.allSettled([commands.dissolveFamily(x.a.sessionToken,x.f.familyId,x.ar.membershipId),second.transfers.respond(x.b.sessionToken,x.f.familyId,pending.transferId,1,'accept')]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const family = await createSqliteFamilyRepository(db).withTransaction(tx=>tx.findFamily(x.f.familyId));
    if (family?.status==='dissolved') {
      expect(await db.getFirst("SELECT COUNT(*) AS n FROM family_memberships WHERE family_id=? AND status='active'",[x.f.familyId])).toEqual({n:0});
    } else {
      expect((await commands.getFamilyRoster(x.b.sessionToken,x.f.familyId)).role).toBe('creator');
    }
    expect((await commands.previewInviteLink(link.token,'peer')).status).not.toBe('pending');
  } finally { await secondDb.close(); }
});
it('rolls back snapshot retirement if database deletion fails, then retries safely',async()=>{
  const x=await setup();await commands.dissolveFamily(x.a.sessionToken,x.f.familyId);
  const failed = {...db,run:async(sql:string,params?:unknown[])=>{if(sql.startsWith('DELETE FROM family_shares'))throw new Error('disk');return db.run(sql,params);}};
  expect(await runFamilyCleanup(failed,blobs,new Date(deadline))).toMatchObject({failed:1});
  expect(await db.getFirst('SELECT object_id FROM family_media_objects WHERE object_id=?',[x.photo.objectId])).not.toBeNull();
  expect(await db.getFirst('SELECT share_id FROM family_shares WHERE share_id=?',[x.shared.shareId])).not.toBeNull();
  expect(blobs.files.has(x.photo.objectId)).toBe(true);
  expect(await runFamilyCleanup(db,blobs,new Date(deadline))).toMatchObject({completed:1,failed:0});
});
it('an upload reuse delayed before restore cannot resurrect a file retired by cleanup',async()=>{
  const x=await setup();await commands.dissolveFamily(x.a.sessionToken,x.f.familyId);
  const repository=createSqliteFamilyRepository(db);let ready!:()=>void,release!:()=>void;
  const started=new Promise<void>(r=>{ready=r;}),gate=new Promise<void>(r=>{release=r;});
  const delayed=createFamilyCommands({repository:{async withTransaction<T>(work:(tx:FamilyTx)=>Promise<T>){
    const result=await repository.withTransaction(work);
    if(result && typeof result==='object' && 'kind' in result && result.kind==='reuse'){ready();await gate;}
    return result;
  }},apple:createMapAppleVerifier({}),mediaBlobs:blobs,clock:{now:()=>now}});
  const upload=delayed.uploadMedia(x.a.sessionToken,{bytes:sampleJpegBytes(),mimeType:'image/jpeg',idempotencyKey:'upload'});
  await started;
  expect(await runFamilyCleanup(db,blobs,new Date(deadline))).toMatchObject({completed:1});
  release();await expect(upload).rejects.toMatchObject({code:'MEDIA_NOT_FOUND'});
  expect(blobs.files.has(x.photo.objectId)).toBe(false);
});

it('does not report another dissolved family cleaned while their common file deletion is still failing',async()=>{
 const x=await setup(),other=await commands.createNamedFamily(x.a.sessionToken,'Other','other');await x.share(other.familyId,'second');
 await commands.dissolveFamily(x.a.sessionToken,x.f.familyId);await commands.dissolveFamily(x.a.sessionToken,other.familyId);
 const failing={...blobs,remove:async()=>{throw new Error('disk');}};
 expect(await runFamilyCleanup(db,failing,new Date(deadline))).toMatchObject({checked:2,failed:2,completed:0});
 expect(await db.getFirst('SELECT COUNT(*) AS n FROM family_families WHERE cleaned_at IS NOT NULL')).toEqual({n:0});
 expect(await runFamilyCleanup(db,blobs,new Date(deadline))).toMatchObject({completed:2,failed:0});
});

it('backfills old dissolved families from migration time with an explicit estimated flag and preserves active families',async()=>{
 await db.close();db=openFamilySqliteDatabase(path.join(dir,'legacy.sqlite'));await applyFamilyApiSchema(db,{upTo:22});
 await db.run("INSERT INTO family_families(family_id,created_at,status,name) VALUES('old','2020-01-01','dissolved','Old'),('live','2020-01-01','active','Live')");
 await applyFamilyApiSchema(db);
 const old=await db.getFirst<{dissolved_at:string;cleanup_deadline:string;cleanup_time_estimated:number}>("SELECT dissolved_at,cleanup_deadline,cleanup_time_estimated FROM family_families WHERE family_id='old'");
 expect(old?.cleanup_time_estimated).toBe(1);expect(Date.parse(old!.cleanup_deadline)-Date.parse(old!.dissolved_at)).toBe(30*24*60*60*1000);
 expect(await db.getFirst("SELECT name,dissolved_at,cleanup_deadline,cleanup_time_estimated FROM family_families WHERE family_id='live'")).toEqual({name:'Live',dissolved_at:null,cleanup_deadline:null,cleanup_time_estimated:0});
});
