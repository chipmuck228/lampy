import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFamilyCommands } from './commands';
import { createMapAppleVerifier } from './apple';
import { openFamilySqliteDatabase } from './node-db';
import { applyFamilyApiSchema, type FamilySql } from './schema';
import { createSqliteFamilyRepository } from './sqlite-repository';
import { dispatchFamilyApi } from './http';

const apple = createMapAppleVerifier({ a: { appleSubject: 'a', email: 'same@example.com' }, b: { appleSubject: 'b', email: 'same@example.com' } });
async function open(file: string) {
  const db = openFamilySqliteDatabase(file);
  await applyFamilyApiSchema(db);
  const commands = createFamilyCommands({ repository: createSqliteFamilyRepository(db), apple });
  return { db, commands };
}
async function withFile(work: (file: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), 'lampy-multi-'));
  try { await work(path.join(dir, 'family.db')); } finally { await rm(dir, { recursive: true, force: true }); }
}
describe('multi-family foundation on real SQLite', () => {
  it('migrates a v16 family without changing identity or legacy history', async () => {
    await withFile(async file => {
      const db = openFamilySqliteDatabase(file);
      await applyFamilyApiSchema(db, { upTo: 16 });
      await db.run("INSERT INTO family_families VALUES ('old', 'now', 'active')");
      await db.run("INSERT INTO family_memberships VALUES ('m', 'old', 'u', 'creator', 'active', 'now')");
      await applyFamilyApiSchema(db);
      expect(await db.getFirst('SELECT family_id,name FROM family_families')).toEqual({ family_id: 'old', name: '' });
      expect(await db.getFirst('SELECT user_id,role FROM family_memberships')).toEqual({ user_id: 'u', role: 'creator' });
      expect(await db.getFirst("SELECT name FROM sqlite_master WHERE name = 'family_memberships_one_active_per_user'")).toBeNull();
      await db.close();
    });
  });
  it('rolls back constraint replacement if recording migration 18 fails', async () => {
    await withFile(async file => {
      const db = openFamilySqliteDatabase(file);
      await applyFamilyApiSchema(db, { upTo: 17 });
      const failing: FamilySql = { ...db, run: async (sql, params) => {
        if (sql.includes('INSERT INTO family_schema_migrations') && params?.[0] === 18) throw new Error('disk full');
        return db.run(sql, params);
      } };
      await expect(applyFamilyApiSchema(failing)).rejects.toThrow('disk full');
      expect(await db.getFirst("SELECT name FROM sqlite_master WHERE name = 'family_memberships_one_active_per_user'")).not.toBeNull();
      expect(await db.getFirst('SELECT version FROM family_schema_migrations WHERE version=18')).toBeNull();
      await applyFamilyApiSchema(db);
      expect(await db.getFirst('SELECT version FROM family_schema_migrations WHERE version=19')).toEqual({ version:19 });
      await db.close();
    });
  });
  it('keeps two device sessions, roles, idempotence and names after reopening; legacy operations refuse ambiguity', async () => {
    await withFile(async file => {
      const first = await open(file);
      const a = await first.commands.signInWithApple('a');
      const secondDevice = await first.commands.signInWithApple('a');
      const b = await first.commands.signInWithApple('b');
      expect(a.userId).toBe(secondDevice.userId);
      expect(a.userId).not.toBe(b.userId);
      const one = await first.commands.createFamily(b.sessionToken);
      const invite = await first.commands.inviteMember(b.sessionToken, one.familyId);
      await first.commands.acceptInvitation(a.sessionToken, invite.code);
      const two = await first.commands.createNamedFamily(a.sessionToken, '  家里的日子  ', 'op-2');
      expect(await first.commands.createNamedFamily(a.sessionToken, '家里的日子', 'op-2')).toEqual(two);
      await expect(first.commands.createNamedFamily(a.sessionToken, 'different', 'op-2')).rejects.toMatchObject({ code: 'CONFLICT' });
      const rows = await first.commands.listFamilies(secondDevice.sessionToken);
      expect(rows.families.map(f => f.role).sort()).toEqual(['creator','member']);
      await expect(first.commands.listMembership(a.sessionToken)).rejects.toMatchObject({ code: 'FAMILY_SELECTION_REQUIRED' });
      await expect(first.commands.leaveFamily(a.sessionToken)).rejects.toMatchObject({ code: 'FAMILY_SELECTION_REQUIRED' });
      await first.commands.signOut(a.sessionToken);
      await expect(first.commands.listFamilies(a.sessionToken)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      await first.db.close();
      const reopened = await open(file);
      expect((await reopened.commands.listFamilies(secondDevice.sessionToken)).families).toHaveLength(2);
      expect((await reopened.commands.listFamilies(b.sessionToken)).families).toHaveLength(1);
      await reopened.db.close();
    });
  });
  it('serializes the last slot across separate SQLite connections and rolls back the losing creation', async () => {
    await withFile(async file => {
      const left = await open(file);
      const a = await left.commands.signInWithApple('a');
      for (let i = 0; i < 9; i++) await left.commands.createNamedFamily(a.sessionToken, `Family ${i}`, `op-${i}`);
      const right = await open(file);
      const results = await Promise.allSettled([
        left.commands.createNamedFamily(a.sessionToken, 'Ten left', 'last-left'),
        right.commands.createNamedFamily(a.sessionToken, 'Ten right', 'last-right'),
      ]);
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'FAMILY_LIMIT_REACHED' } });
      expect((await left.commands.listFamilies(a.sessionToken)).families).toHaveLength(10);
      expect(await left.db.getFirst('SELECT COUNT(*) AS n FROM family_families')).toEqual({ n: 10 });
      const familyId = (await left.commands.listFamilies(a.sessionToken)).families[0].familyId;
      await left.commands.dissolveFamily(a.sessionToken, familyId);
      await left.commands.createNamedFamily(a.sessionToken, 'Replacement', 'replacement');
      expect((await left.commands.listFamilies(a.sessionToken)).families).toHaveLength(10);
      await left.db.close(); await right.db.close();
    });
  });
  it('validates HTTP names and requires authentication, with no implicit v1 target', async () => {
    await withFile(async file => {
      const { db, commands } = await open(file);
      expect((await dispatchFamilyApi(commands,{method:'GET', path:'/v2/me/families',headers:{}})).status).toBe(401);
      const a = await commands.signInWithApple('a');
      const headers = { authorization: `Bearer ${a.sessionToken}`, 'idempotency-key': 'name' };
      for (const name of ['', 'x'.repeat(41), 'bad\nname']) expect((await dispatchFamilyApi(commands,{ method:'POST', path:'/v2/families',headers,body:{name} })).status).toBe(400);
      expect((await dispatchFamilyApi(commands,{ method:'POST',path:'/v2/families',headers,body:{name:'Our home'} })).status).toBe(200);
      await db.close();
    });
  });
});
