import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFamilyCommands } from './commands';
import { createMapAppleVerifier } from './apple';
import { openFamilySqliteDatabase } from './node-db';
import { applyFamilyApiSchema } from './schema';
import { createSqliteFamilyRepository } from './sqlite-repository';
import { dispatchFamilyApi } from './http';
const apple = createMapAppleVerifier({ a: { appleSubject: 'a' }, b: { appleSubject: 'b' }, c: { appleSubject: 'c' } });
async function setup(work: (s: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
 const dir = await mkdtemp(path.join(tmpdir(),'lampy-transfer-')); const s = await fixture(path.join(dir,'f.db'));
 try { await work(s); } finally { await s.db.close(); await rm(dir,{recursive:true,force:true}); }
}
async function fixture(file: string) {
 const db=openFamilySqliteDatabase(file); await applyFamilyApiSchema(db);
 const commands=createFamilyCommands({repository:createSqliteFamilyRepository(db),apple,inviteLinksEnabled:true});
 const a=await commands.signInWithApple('a'),b=await commands.signInWithApple('b'),c=await commands.signInWithApple('c');
 const f=await commands.createNamedFamily(a.sessionToken,'Home','home');
 const invitation=await commands.inviteMember(a.sessionToken,f.familyId);await commands.acceptInvitation(b.sessionToken,invitation.code);
 const ar=await commands.getFamilyRoster(a.sessionToken,f.familyId),br=await commands.getFamilyRoster(b.sessionToken,f.familyId);
 const input={requestId:'intent',fromMembershipId:ar.membershipId,toMembershipId:br.membershipId};
 return {db,file,commands,a,b,c,f,ar,br,input};
}
it('persists one pending intent across reopen; exchanges roles once and revokes unused invites without changing other families',async()=>setup(async s=>{
 const other=await s.commands.createNamedFamily(s.a.sessionToken,'Other','other');
 const invite=await s.commands.createInviteLink(s.a.sessionToken,s.f.familyId);
 const t=await s.commands.transfers.create(s.a.sessionToken,s.f.familyId,s.input);
 expect(await s.commands.transfers.create(s.a.sessionToken,s.f.familyId,s.input)).toEqual(t);
 await expect(s.commands.transfers.create(s.a.sessionToken,s.f.familyId,{...s.input,requestId:'second'})).rejects.toMatchObject({code:'CONFLICT'});
 expect((await s.commands.getFamilyRoster(s.a.sessionToken,s.f.familyId)).role).toBe('creator');
 const db2=openFamilySqliteDatabase(s.file);const next=createFamilyCommands({repository:createSqliteFamilyRepository(db2),apple,inviteLinksEnabled:true});
 try {
  expect((await next.transfers.get(s.b.sessionToken,s.f.familyId)).transfer).toEqual(t);
  const receipt=await next.transfers.respond(s.b.sessionToken,s.f.familyId,t.transferId,1,'accept');
  expect(receipt.status).toBe('accepted');expect(await next.transfers.respond(s.b.sessionToken,s.f.familyId,t.transferId,1,'accept')).toEqual(receipt);
  expect((await next.getFamilyRoster(s.a.sessionToken,s.f.familyId)).role).toBe('member');
  expect((await next.getFamilyRoster(s.b.sessionToken,s.f.familyId)).role).toBe('creator');
  expect((await next.getFamilyRoster(s.a.sessionToken,other.familyId)).role).toBe('creator');
  expect(await s.db.getFirst("SELECT COUNT(*) AS n FROM family_memberships WHERE family_id=? AND status='active' AND role='creator'",[s.f.familyId])).toEqual({n:1});
  expect((await next.previewInviteLink(invite.token,'isolated-peer')).status).toBe('revoked');
  await expect(next.createInviteLink(s.a.sessionToken,s.f.familyId)).rejects.toMatchObject({code:'FORBIDDEN'});
  await next.createInviteLink(s.b.sessionToken,s.f.familyId);
  await next.leaveSelectedFamily(s.a.sessionToken,s.f.familyId,s.ar.membershipId);
 } finally {await db2.close();}
}));
it('requires the target to accept and original creator to cancel; stale version and reused intent cannot change the target',async()=>setup(async s=>{
 const t=await s.commands.transfers.create(s.a.sessionToken,s.f.familyId,s.input);
 await expect(s.commands.transfers.respond(s.a.sessionToken,s.f.familyId,t.transferId,1,'accept')).rejects.toMatchObject({code:'FORBIDDEN'});
 await expect(s.commands.transfers.respond(s.b.sessionToken,s.f.familyId,t.transferId,1,'cancel')).rejects.toMatchObject({code:'FORBIDDEN'});
 await expect(s.commands.transfers.respond(s.c.sessionToken,s.f.familyId,t.transferId,1,'accept')).rejects.toMatchObject({code:'NOT_IN_FAMILY'});
 await expect(s.commands.transfers.respond(s.b.sessionToken,s.f.familyId,t.transferId,2,'accept')).rejects.toMatchObject({code:'CONFLICT'});
 await expect(s.commands.transfers.create(s.a.sessionToken,s.f.familyId,{...s.input,toMembershipId:'other'})).rejects.toMatchObject({code:'CONFLICT'});
 await s.commands.transfers.respond(s.a.sessionToken,s.f.familyId,t.transferId,1,'cancel');
 await expect(s.commands.transfers.respond(s.b.sessionToken,s.f.familyId,t.transferId,1,'accept')).rejects.toMatchObject({code:'CONFLICT'});
 expect((await s.commands.transfers.create(s.a.sessionToken,s.f.familyId,s.input)).status).toBe('cancelled');
}));
it.each(['leave','remove'] as const)('invalidates the original membership after %s and rejoin',async mode=>setup(async s=>{
 const t=await s.commands.transfers.create(s.a.sessionToken,s.f.familyId,s.input);
 if(mode==='leave')await s.commands.leaveSelectedFamily(s.b.sessionToken,s.f.familyId,s.br.membershipId);
 else await s.commands.removeSelectedMember(s.a.sessionToken,s.f.familyId,s.b.userId,s.br.membershipId);
 const invite=await s.commands.inviteMember(s.a.sessionToken,s.f.familyId);await s.commands.acceptInvitation(s.b.sessionToken,invite.code);
 await expect(s.commands.transfers.respond(s.b.sessionToken,s.f.familyId,t.transferId,1,'accept')).rejects.toMatchObject({code:'CONFLICT'});
 expect(await s.commands.transfers.get(s.a.sessionToken,s.f.familyId)).toEqual({transfer:null});
 expect((await s.commands.getFamilyRoster(s.a.sessionToken,s.f.familyId)).role).toBe('creator');
}));
it('serializes acceptance against cancellation on separate connections with only one winner',async()=>setup(async s=>{
 const t=await s.commands.transfers.create(s.a.sessionToken,s.f.familyId,s.input);
 const db2=openFamilySqliteDatabase(s.file),second=createFamilyCommands({repository:createSqliteFamilyRepository(db2),apple});
 try {
  const results=await Promise.allSettled([s.commands.transfers.respond(s.a.sessionToken,s.f.familyId,t.transferId,1,'cancel'),second.transfers.respond(s.b.sessionToken,s.f.familyId,t.transferId,1,'accept')]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{code:'CONFLICT'}});
  expect(await s.db.getFirst("SELECT COUNT(*) AS n FROM family_memberships WHERE family_id=? AND role='creator' AND status='active'",[s.f.familyId])).toEqual({n:1});
 } finally {await db2.close();}
}));
it('rolls back demotion and keeps the request pending when promoting fails',async()=>setup(async s=>{
 const t=await s.commands.transfers.create(s.a.sessionToken,s.f.familyId,s.input);
 const repository=createSqliteFamilyRepository(s.db);
 const failing=createFamilyCommands({apple,repository:{withTransaction:work=>repository.withTransaction(tx=>work({...tx,saveMembership:async m=>{if(m.userId===s.b.userId && m.role==='creator')throw new Error('disk full');return tx.saveMembership(m);}}))}});
 await expect(failing.transfers.respond(s.b.sessionToken,s.f.familyId,t.transferId,1,'accept')).rejects.toThrow('disk full');
 expect((await s.commands.getFamilyRoster(s.a.sessionToken,s.f.familyId)).role).toBe('creator');expect((await s.commands.transfers.get(s.b.sessionToken,s.f.familyId)).transfer?.status).toBe('pending');
}));
it('rejects self transfer, dissolution and malformed HTTP revisions',async()=>setup(async s=>{
 await expect(s.commands.transfers.create(s.a.sessionToken,s.f.familyId,{...s.input,toMembershipId:s.ar.membershipId})).rejects.toMatchObject({code:'MEMBER_NOT_FOUND'});
 const t=await s.commands.transfers.create(s.a.sessionToken,s.f.familyId,s.input);
 const response=await dispatchFamilyApi(s.commands,{method:'POST',path:`/v2/families/${s.f.familyId}/creator-transfer/${t.transferId}/accept`,headers:{authorization:`Bearer ${s.b.sessionToken}`},body:{revision:'1'}});
 expect(response.status).toBe(400);
 await s.commands.dissolveFamily(s.a.sessionToken,s.f.familyId);
 await expect(s.commands.transfers.respond(s.b.sessionToken,s.f.familyId,t.transferId,1,'accept')).rejects.toMatchObject({code:'FAMILY_DISSOLVED'});
}));
it('adds only migration 22 to a v21 database and rolls back an interrupted migration',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'lampy-transfer-schema-')),db=openFamilySqliteDatabase(path.join(dir,'f.db'));
 try {
  await applyFamilyApiSchema(db,{upTo:21});await db.run("INSERT INTO family_families(family_id,created_at,status,name,history_policy) VALUES('original','now','active','Home','family-history-v2')");
  const versions=await db.getAll('SELECT version,applied_at FROM family_schema_migrations ORDER BY version');
  await expect(applyFamilyApiSchema({...db,run:async(sql,params)=>{if(sql.includes('INSERT INTO family_schema_migrations') && params?.[0]===22)throw new Error('disk full');return db.run(sql,params);}})).rejects.toThrow('disk full');
  expect(await db.getFirst("SELECT name FROM sqlite_master WHERE name='family_creator_transfers'")).toBeNull();
  await applyFamilyApiSchema(db);expect((await db.getAll('SELECT version,applied_at FROM family_schema_migrations WHERE version<=21 ORDER BY version'))).toEqual(versions);
  expect(await db.getFirst("SELECT family_id,name,history_policy FROM family_families")).toEqual({family_id:'original',name:'Home',history_policy:'family-history-v2'});
 } finally {await db.close();await rm(dir,{recursive:true,force:true});}
});
