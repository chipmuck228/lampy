import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openFamilySqliteDatabase } from './node-db';
import { applyFamilyApiSchema, assertFamilyTestAccountSchemaReady } from './schema';
import { createSqliteFamilyRepository } from './sqlite-repository';
import { createFamilyStore } from './store';
import { createMemoryFamilyRepository, type FamilyRepository } from './repository';

const createdAt = '2026-10-01T00:00:00Z';
async function sqlite(run: (file: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), 'lampy-login-model-'));
  try { await run(path.join(dir, 'family.sqlite')); } finally { await rm(dir, { recursive: true, force: true }); }
}

describe('login identity migration', () => {
  it('upgrades 27 without changing accounts, passwords, sessions, profiles, memberships or shares, and is repeatable', async () => sqlite(async file => {
    let db = openFamilySqliteDatabase(file);
    await applyFamilyApiSchema(db, { upTo: 27 });
    await expect(assertFamilyTestAccountSchemaReady(db)).rejects.toThrow('27 and 28');
    await db.run('INSERT INTO family_accounts(user_id,apple_subject,email,created_at) VALUES (?,?,?,?)', ['a','apple-a','same@example.com',createdAt]);
    await db.run('INSERT INTO family_accounts(user_id,apple_subject,email,created_at) VALUES (?,?,?,?)', ['b',null,'same@example.com',createdAt]);
    await db.run('INSERT INTO family_test_credentials(credential_id,login_normalized,user_id,password_hash,enabled,created_at,operator_provisioned) VALUES (?,?,?,?,?,?,?)', ['c','same@example.com','b','unchanged-hash',0,createdAt,1]);
    await db.run('INSERT INTO family_sessions(token,user_id,expires_at) VALUES (?,?,?)', ['session','b','2030-01-01']);
    await db.run('INSERT INTO family_user_profiles(user_id,nickname,updated_at) VALUES (?,?,?)', ['b','昵称',createdAt]);
    await db.run('INSERT INTO family_families(family_id,created_at,status) VALUES (?,?,?)', ['family',createdAt,'active']);
    await db.run('INSERT INTO family_memberships(membership_id,family_id,user_id,role,status,joined_at) VALUES (?,?,?,?,?,?)', ['member','family','b','creator','active',createdAt]);
    await db.run('INSERT INTO family_media_objects(object_id,owner_user_id,mime_type,byte_length,content_sha256,storage_key,created_at) VALUES (?,?,?,?,?,?,?)', ['photo','b','image/jpeg',1,'hash','unchanged-key',createdAt]);
    await db.run('INSERT INTO family_shares(share_id,family_id,author_user_id,source_moment_id,source_revision,snapshot_json,audience_json,shared_at) VALUES (?,?,?,?,?,?,?,?)', ['share','family','b','moment',1,'{"note":"原记录","media":[]}','[]',createdAt]);
    const tables = ['family_accounts','family_test_credentials','family_sessions','family_user_profiles','family_families','family_memberships','family_media_objects','family_shares'];
    const before = await Promise.all(tables.map(t => db.getAll(`SELECT * FROM ${t}`)));
    await applyFamilyApiSchema(db); await applyFamilyApiSchema(db);
    await expect(assertFamilyTestAccountSchemaReady(db)).resolves.toBeUndefined();
    expect(await Promise.all(tables.map(t => db.getAll(`SELECT * FROM ${t}`)))).toEqual(before);
    expect(await db.getAll('SELECT provider,subject,user_id FROM family_login_identities ORDER BY provider')).toEqual([
      { provider:'apple',subject:'apple-a',user_id:'a' }, { provider:'controlled-password',subject:'same@example.com',user_id:'b' },
    ]);
    // Disabled credentials remain disabled: identity presence does not authorize password login.
    await db.close(); db = openFamilySqliteDatabase(file);
    const repo = createSqliteFamilyRepository(db);
    await repo.withTransaction(async tx => {
      expect((await tx.findAccountByAppleSubject('apple-a'))?.userId).toBe('a');
      expect((await tx.findTestCredentialByLogin('same@example.com'))?.enabled).toBe(false);
      expect((await tx.findSession('session'))?.userId).toBe('b');
    });
    await db.close();
  }));

  it('rolls back migration on corrupt blank legacy identity instead of losing data', async () => sqlite(async file => {
    const db = openFamilySqliteDatabase(file); await applyFamilyApiSchema(db,{ upTo:27 });
    await db.run('INSERT INTO family_accounts(user_id,apple_subject,created_at) VALUES (?,?,?)',['bad',' ',createdAt]);
    await expect(applyFamilyApiSchema(db)).rejects.toThrow();
    expect(await db.getFirst('SELECT version FROM family_schema_migrations WHERE version=28')).toBeNull();
    expect(await db.getFirst("SELECT name FROM sqlite_master WHERE name='family_login_identities'")).toBeNull();
    expect((await db.getFirst<{ user_id: string }>('SELECT user_id FROM family_accounts'))?.user_id).toBe('bad');
    await db.close();
  }));
});

async function assertModel(repo: FamilyRepository) {
  await repo.withTransaction(async tx => {
    await tx.saveAccount({ userId:'a',createdAt }); await tx.saveAccount({ userId:'b',createdAt });
    await tx.saveTestCredential({ credentialId:'c',loginNormalized:'login@example.com',userId:'a',passwordHash:'hash',enabled:true,createdAt });
    await tx.attachLoginIdentity({ provider:'apple',subject:'apple-a',userId:'a',createdAt });
    await tx.attachLoginIdentity({ provider:'apple',subject:'apple-a',userId:'a',createdAt:'later' });
    expect((await tx.listLoginIdentities('a')).length).toBe(2);
    expect((await tx.findAccountByAppleSubject('apple-a'))?.userId).toBe('a');
  });
  await expect(repo.withTransaction(tx => tx.attachLoginIdentity({ provider:'apple',subject:'apple-a',userId:'b',createdAt }))).rejects.toThrow('login_identity');
  await expect(repo.withTransaction(tx => tx.attachLoginIdentity({ provider:'apple',subject:'another',userId:'a',createdAt }))).rejects.toThrow('login_identity');
  await expect(repo.withTransaction(tx => tx.attachLoginIdentity({ provider:'apple',subject:'missing',userId:'missing',createdAt }))).rejects.toThrow('login_identity');
  await expect(repo.withTransaction(tx => tx.saveTestCredential({ credentialId:'c',loginNormalized:'changed@example.com',userId:'a',passwordHash:'hash',enabled:true,createdAt }))).rejects.toThrow('login_identity');
  await repo.withTransaction(async tx => {
    expect((await tx.findLoginIdentity('apple','apple-a'))?.userId).toBe('a');
    expect((await tx.findTestCredentialByLogin('login@example.com'))?.userId).toBe('a');
  });
}

describe('login identity repository parity', () => {
  it('guards ownership and same-provider replacement in memory', async () => assertModel(createMemoryFamilyRepository(createFamilyStore())));
  it('guards ownership and same-provider replacement in SQLite', async () => sqlite(async file => {
    const db = openFamilySqliteDatabase(file); await applyFamilyApiSchema(db);
    await assertModel(createSqliteFamilyRepository(db)); await db.close();
  }));
  it('rolls back a late account conflict and concurrent ownership claims', async () => sqlite(async file => {
    const db = openFamilySqliteDatabase(file); await applyFamilyApiSchema(db);
    const repo = createSqliteFamilyRepository(db);
    await repo.withTransaction(async tx => { await tx.saveAccount({userId:'a',createdAt}); await tx.saveAccount({userId:'b',createdAt}); });
    const results = await Promise.allSettled(['a','b'].map(userId => repo.withTransaction(tx => tx.attachLoginIdentity({provider:'apple',subject:'race',userId,createdAt}))));
    expect(results.filter(r => r.status==='fulfilled')).toHaveLength(1);
    await expect(repo.withTransaction(tx => tx.saveAccount({userId:'c',appleSubject:'race',createdAt}))).rejects.toThrow('login_identity');
    await repo.withTransaction(async tx => expect(await tx.findAccountByUserId('c')).toBeNull());
    await db.close();
  }));
});
