import { createFamilyCommands } from './commands';
import { createMapAppleVerifier } from './apple';
import { createMemoryFamilyRepository, type FamilyRepository } from './repository';
import { createFamilyStore } from './store';
import { openFamilySqliteDatabase } from './node-db';
import { createSqliteFamilyRepository } from './sqlite-repository';
import { applyFamilyApiSchema, assertFamilyTestAccountSchemaReady } from './schema';
import { attachVerifiedLoginIdentity, loginIdentityKey } from './login-identity';
import type { LoginIdentity } from './types';
import { dispatchFamilyApi } from './http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const createdAt = '2026-11-22T04:00:00.000Z';
const expiresAt = '2026-11-23T04:00:00.000Z';
const apple = {provider:'apple',subject:'apple-a'} as const;
const password = {provider:'controlled-password',subject:'a@example.com'} as const;
const identity = (userId:string, provider:LoginIdentity['provider'],subject:string,namespace?:string):LoginIdentity => ({userId,provider,subject,createdAt,...(namespace?{namespace}:{})});

for (const sqlite of [false,true]) describe(sqlite?'unified login SQLite':'unified login memory',()=>{
  let repository:FamilyRepository;
  let db:ReturnType<typeof openFamilySqliteDatabase>|undefined;
  let now:Date;
  beforeEach(async()=>{
    now=new Date(createdAt);
    if(sqlite){db=openFamilySqliteDatabase(':memory:');await applyFamilyApiSchema(db);repository=createSqliteFamilyRepository(db);}
    else repository=createMemoryFamilyRepository(createFamilyStore());
    await repository.withTransaction(async tx=>{
      await tx.saveAccount({userId:'a',appleSubject:'apple-a',createdAt});
      await tx.saveAccount({userId:'b',appleSubject:'apple-b',createdAt});
      await tx.saveTestCredential({credentialId:'cred-a',userId:'a',loginNormalized:password.subject,passwordHash:'hash',enabled:true,createdAt});
      await tx.saveSession({userId:'a',token:'a-apple',expiresAt,authenticatedAt:createdAt,authenticatedIdentity:loginIdentityKey(apple)});
      await tx.saveSession({userId:'a',token:'a-password',expiresAt,authenticatedAt:createdAt,authenticatedIdentity:loginIdentityKey(password)});
      await tx.saveSession({userId:'a',token:'legacy',expiresAt});
    });
  });
  afterEach(async()=>{await db?.close();db=undefined;});
  function commands(enabled=true){return createFamilyCommands({repository,clock:{now:()=>now},loginManagementEnabled:enabled,appleLoginEnabled:true,testAccountLoginEnabled:true,
    apple:createMapAppleVerifier({a:{appleSubject:'apple-a'},b:{appleSubject:'apple-b'}}),passwordHasher:{hash:async()=> 'hash',verify:async()=>true}});}

  it('stores scoped providers without merging equal subjects, emails or historical user IDs',async()=>{
    await repository.withTransaction(async tx=>{
      await tx.attachLoginIdentity(identity('a','google','same-sub','google-project-1'));
      await tx.attachLoginIdentity(identity('b','google','same-sub','google-project-2'));
      await tx.attachLoginIdentity(identity('b','wechat','same-sub','wx-app'));
      expect((await tx.findLoginIdentity('google','same-sub','google-project-1'))?.userId).toBe('a');
      expect((await tx.findLoginIdentity('google','same-sub','google-project-2'))?.userId).toBe('b');
      expect(await tx.findLoginIdentity('google','same-sub')).toBeNull();
      expect((await tx.findAccountByAppleSubject('apple-a'))?.userId).toBe('a');
    });
    const listed=await commands().loginMethods.list('a-apple');
    expect(listed.find(i=>i.provider==='google')).toMatchObject({available:false});
    expect(JSON.stringify(listed)).not.toContain('same-sub');
  });

  it('rejects missing scope, replacement, cross-account attachment and rolls back partial work',async()=>{
    await expect(repository.withTransaction(tx=>tx.attachLoginIdentity(identity('a','wechat','x')))).rejects.toThrow();
    await repository.withTransaction(tx=>tx.attachLoginIdentity(identity('a','google','x','issuer')));
    for(const row of [identity('b','google','x','issuer'),identity('a','google','different','issuer')]) {
      await expect(repository.withTransaction(async tx=>{
        await tx.attachLoginIdentity(identity('b','email-otp','same@example.com','email-service'));
        await tx.attachLoginIdentity(row);
      })).rejects.toThrow();
      expect(await repository.withTransaction(tx=>tx.findLoginIdentity('email-otp','same@example.com','email-service'))).toBeNull();
    }
  });

  it('only an active, recently authenticated session can bind a verified new credential',async()=>{
    await expect(repository.withTransaction(tx=>attachVerifiedLoginIdentity(tx,'legacy',identity('a','google','new','issuer'),now)))
      .rejects.toMatchObject({code:'REAUTHENTICATION_REQUIRED'});
    await repository.withTransaction(tx=>attachVerifiedLoginIdentity(tx,'a-apple',identity('a','google','new','issuer'),now));
    now=new Date(now.getTime()+300_001);
    await expect(repository.withTransaction(tx=>attachVerifiedLoginIdentity(tx,'a-apple',identity('a','wechat','new','wx'),now)))
      .rejects.toMatchObject({code:'REAUTHENTICATION_REQUIRED'});
  });

  it('requires authentication using a method kept after unlinking, revokes other sessions and preserves the account',async()=>{
    const c=commands();
    await expect(c.loginMethods.unlink('a-apple',{provider:'apple'})).rejects.toMatchObject({code:'REAUTHENTICATION_REQUIRED'});
    await c.createNamedFamily('a-password','our family','family-create');
    await expect(c.loginMethods.unlink('a-password',{provider:'apple'})).resolves.toEqual({unlinked:true});
    await repository.withTransaction(async tx=>{
      expect(await tx.findLoginIdentity('apple','apple-a')).toBeNull();
      expect(await tx.findAccountByAppleSubject('apple-a')).toBeNull();
      expect((await tx.findAccountByUserId('a'))?.userId).toBe('a');
      expect(await tx.findSession('a-apple')).toBeNull();
      expect(await tx.findSession('a-password')).not.toBeNull();
    });
    expect((await c.listFamilies('a-password')).families).toHaveLength(1);
    await expect(c.loginMethods.unlink('a-password',{provider:'controlled-password'})).rejects.toMatchObject({code:'LAST_LOGIN_METHOD'});
  });

  it('removes the legacy password login path when that method is unlinked',async()=>{
    await commands().loginMethods.unlink('a-apple',{provider:'controlled-password'});
    expect(await repository.withTransaction(tx=>tx.findTestCredentialByUserId('a'))).toBeNull();
    await expect(commands().signInWithTestAccount({login:password.subject,password:'whatever'})).rejects.toMatchObject({code:'AUTH_FAILED'});
    expect((await commands().signInWithApple('a')).userId).toBe('a');
  });

  it('never counts disabled or not-yet-enabled credentials as a recovery method',async()=>{
    await repository.withTransaction(async tx=>{
      const credential=(await tx.findTestCredentialByUserId('a'))!;
      await tx.saveTestCredential({...credential,enabled:false});
      await tx.attachLoginIdentity(identity('a','phone-otp','+8613800000000','sms-mainland'));
    });
    // A disabled controlled account remains blocked, including linked Apple sessions.
    await expect(commands().loginMethods.unlink('a-apple',{provider:'apple'})).rejects.toMatchObject({code:'UNAUTHENTICATED'});
    await expect(commands().signInWithApple('a')).rejects.toMatchObject({code:'AUTH_FAILED'});
  });

  it('serializes concurrent unlink attempts and retains a usable login',async()=>{
    const c=commands();
    const result=await Promise.allSettled([
      c.loginMethods.unlink('a-password',{provider:'apple'}),c.loginMethods.unlink('a-apple',{provider:'controlled-password'}),
    ]);
    expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(await repository.withTransaction(tx=>tx.listLoginIdentities('a'))).toHaveLength(1);
  });

  it('account suspension revokes sessions/challenges and blocks all existing login routes without changing family data',async()=>{
    const c=commands();await c.createNamedFamily('a-apple','family','create');
    await c.beginAppleAuth('link','a-apple');
    await repository.withTransaction(tx=>tx.setAccountStatus('a','suspended'));
    await expect(c.getMyProfile('a-apple')).rejects.toMatchObject({code:'UNAUTHENTICATED'});
    await expect(c.signInWithApple('a')).rejects.toMatchObject({code:'UNAUTHENTICATED'});
    await expect(c.signInWithTestAccount({login:password.subject,password:'ok'})).rejects.toMatchObject({code:'UNAUTHENTICATED'});
    await repository.withTransaction(tx=>tx.setAccountStatus('a','active'));
    // Reactivation does not revive a revoked session.
    await expect(c.getMyProfile('a-apple')).rejects.toMatchObject({code:'UNAUTHENTICATED'});
    const login=await c.signInWithApple('a');expect((await c.listFamilies(login.sessionToken)).families).toHaveLength(1);
  });

  it('management defaults closed and no new authentication route is enabled',async()=>{
    const c=commands(false);
    await expect(c.loginMethods.list('a-apple')).rejects.toMatchObject({code:'FORBIDDEN'});
    const result=await dispatchFamilyApi(c,{method:'POST',path:'/v2/auth/google',headers:{},body:{token:'unverified'}});
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({error:{code:'BAD_REQUEST'}});
  });

  it('rejects corrupt or expired session timestamps rather than treating them as unlimited sessions',async()=>{
    await repository.withTransaction(async tx=>{
      for(const [token,expires] of [['corrupt','invalid'],['expired',createdAt]]) {
        await tx.saveSession({userId:'a',token,expiresAt:expires,authenticatedAt:createdAt,authenticatedIdentity:loginIdentityKey(apple)});
      }
    });
    for(const token of ['corrupt','expired']) {
      await expect(commands().getMyProfile(token)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
      await expect(commands().loginMethods.unlink(token,{provider:'controlled-password'})).rejects.toMatchObject({code:'UNAUTHENTICATED'});
    }
  });
});

it('migration 34 preserves legacy identities/sessions, remains repeatable and refuses an unmigrated database',async()=>{
  const db=openFamilySqliteDatabase(':memory:');
  try {
    await applyFamilyApiSchema(db,{upTo:33});
    await expect(assertFamilyTestAccountSchemaReady(db)).rejects.toThrow('34');
    await db.run('INSERT INTO family_accounts(user_id,apple_subject,created_at) VALUES (?,?,?)',['legacy','original',createdAt]);
    await db.run('INSERT INTO family_login_identities(provider,subject,user_id,created_at) VALUES (?,?,?,?)',['apple','original','legacy',createdAt]);
    await db.run('INSERT INTO family_sessions(token,user_id,expires_at) VALUES (?,?,?)',['old-session','legacy',expiresAt]);
    await applyFamilyApiSchema(db);await applyFamilyApiSchema(db);
    const repo=createSqliteFamilyRepository(db);
    await repo.withTransaction(async tx=>{
      expect((await tx.findLoginIdentity('apple','original'))?.userId).toBe('legacy');
      const session=await tx.findSession('old-session');
      expect(session).toEqual({token:'old-session',userId:'legacy',expiresAt});
      expect(await tx.getAccountStatus('legacy')).toBe('active');
    });
    await expect(assertFamilyTestAccountSchemaReady(db)).resolves.toBeUndefined();
  } finally {await db.close();}
});

it('invalid legacy identity rolls back the entire identity-table replacement',async()=>{
  const db=openFamilySqliteDatabase(':memory:');
  try {
    await applyFamilyApiSchema(db,{upTo:33});
    await db.run('INSERT INTO family_accounts(user_id,created_at) VALUES (?,?)',['legacy',createdAt]);
    await db.run('INSERT INTO family_login_identities(provider,subject,user_id,created_at) VALUES (?,?,?,?)',['apple','x'.repeat(1025),'legacy',createdAt]);
    await expect(applyFamilyApiSchema(db)).rejects.toThrow();
    expect(await db.getFirst('SELECT version FROM family_schema_migrations WHERE version=34')).toBeNull();
    expect(await db.getFirst('SELECT subject FROM family_login_identities')).toEqual({subject:'x'.repeat(1025)});
    expect(await db.getFirst("SELECT name FROM sqlite_master WHERE name='family_account_states'")).toBeNull();
  } finally {await db.close();}
});

it('independent SQLite connections enforce ownership and persist identity scopes/status across restart',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'lampy-unified-login-'));
  const file=path.join(dir,'family.sqlite');
  let first:ReturnType<typeof openFamilySqliteDatabase>|undefined;
  let second:ReturnType<typeof openFamilySqliteDatabase>|undefined;
  try {
    first=openFamilySqliteDatabase(file);await applyFamilyApiSchema(first);
    const r1=createSqliteFamilyRepository(first);
    await r1.withTransaction(async tx=>{await tx.saveAccount({userId:'a',createdAt});await tx.saveAccount({userId:'b',createdAt});});
    second=openFamilySqliteDatabase(file);const r2=createSqliteFamilyRepository(second);
    const attempts=await Promise.allSettled([
      r1.withTransaction(tx=>tx.attachLoginIdentity(identity('a','wechat','shared','wx-app'))),
      r2.withTransaction(tx=>tx.attachLoginIdentity(identity('b','wechat','shared','wx-app'))),
    ]);
    expect(attempts.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const owner=(await r1.withTransaction(tx=>tx.findLoginIdentity('wechat','shared','wx-app')))!.userId;
    await r1.withTransaction(tx=>tx.setAccountStatus(owner,'suspended'));
    await first.close();first=undefined;await second.close();second=undefined;
    first=openFamilySqliteDatabase(file);const reopened=createSqliteFamilyRepository(first);
    await reopened.withTransaction(async tx=>{
      expect((await tx.findLoginIdentity('wechat','shared','wx-app'))?.userId).toBe(owner);
      expect(await tx.getAccountStatus(owner)).toBe('suspended');
    });
  } finally {await first?.close();await second?.close();await rm(dir,{recursive:true,force:true});}
});
