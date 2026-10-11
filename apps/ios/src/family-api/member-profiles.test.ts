import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFamilyCommands } from './commands';
import { createMapAppleVerifier } from './apple';
import { openFamilySqliteDatabase } from './node-db';
import { applyFamilyApiSchema } from './schema';
import { createSqliteFamilyRepository } from './sqlite-repository';
import { dispatchFamilyApi } from './http';

it('scopes live nicknames to active family membership, keeps duplicate names tied to membership ids and survives SQLite reopen', async () => {
 const dir = await mkdtemp(path.join(tmpdir(), 'lampy-member-profile-'));
 const file = path.join(dir, 'family.sqlite');
 const db = openFamilySqliteDatabase(file);
 const apple = createMapAppleVerifier({ a: { appleSubject: 'a', email: 'private-a@example.com' }, b: { appleSubject: 'b', email: 'private-b@example.com' }, c: { appleSubject: 'c' } });
 await applyFamilyApiSchema(db);
 const commands = createFamilyCommands({ repository: createSqliteFamilyRepository(db), apple });
 try {
  const a = await commands.signInWithApple('a'), b = await commands.signInWithApple('b'), c = await commands.signInWithApple('c');
  const family = await commands.createNamedFamily(a.sessionToken, '家', 'home');
  const invite = await commands.inviteMember(a.sessionToken, family.familyId); await commands.acceptInvitation(b.sessionToken, invite.code);
  const original = await commands.getFamilyRoster(a.sessionToken, family.familyId);
  expect(original.members.map(m => m.nickname)).toEqual(['', '']);
  await commands.updateMyProfile(a.sessionToken, '小禾'); await commands.updateMyProfile(b.sessionToken, '小禾');
  const named = await commands.getFamilyRoster(b.sessionToken, family.familyId);
  expect(named.members.map(m => m.nickname)).toEqual(['小禾', '小禾']);
  expect(named.members.map(m => m.membershipId)).toEqual(original.members.map(m => m.membershipId));
  expect(named.members.every(m => m.avatar === 'system')).toBe(true);
  expect(JSON.stringify(named)).not.toMatch(/private-|example.com|password|sessionToken/);
  const unauthorized = await dispatchFamilyApi(commands, { method: 'GET', path: `/v2/families/${family.familyId}/members`, headers: { authorization: `Bearer ${c.sessionToken}` } });
  expect(unauthorized.status).not.toBe(200); expect(JSON.stringify(unauthorized.body)).not.toContain('小禾');
  await expect(commands.getFamilyRoster(c.sessionToken, family.familyId)).rejects.toMatchObject({ code: 'NOT_IN_FAMILY' });
  const own = named.members.find(m => m.userId === b.userId)!;
  await commands.leaveSelectedFamily(b.sessionToken, family.familyId, own.membershipId);
  await expect(commands.getFamilyRoster(b.sessionToken, family.familyId)).rejects.toMatchObject({ code: 'NOT_IN_FAMILY' });
  expect((await commands.getFamilyRoster(a.sessionToken, family.familyId)).members).toHaveLength(1);
  const nextInvite = await commands.inviteMember(a.sessionToken, family.familyId); await commands.acceptInvitation(b.sessionToken, nextInvite.code);
  await commands.updateMyProfile(b.sessionToken, '新的昵称');
  const db2 = openFamilySqliteDatabase(file);
  try {
   const restarted = createFamilyCommands({ repository: createSqliteFamilyRepository(db2), apple });
   expect((await restarted.getFamilyRoster(a.sessionToken, family.familyId)).members.find(m => m.userId === b.userId)?.nickname).toBe('新的昵称');
   const fresh = (await restarted.getFamilyRoster(a.sessionToken, family.familyId)).members.find(m => m.userId === b.userId)!;
   await restarted.removeSelectedMember(a.sessionToken, family.familyId, b.userId, fresh.membershipId);
   await expect(restarted.getFamilyRoster(b.sessionToken, family.familyId)).rejects.toMatchObject({ code: 'NOT_IN_FAMILY' });
   await restarted.dissolveFamily(a.sessionToken, family.familyId);
   await expect(restarted.getFamilyRoster(a.sessionToken, family.familyId)).rejects.toMatchObject({ code: 'FAMILY_DISSOLVED' });
  } finally { await db2.close(); }
 } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
});
