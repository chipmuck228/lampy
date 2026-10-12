import { createFamilyCommands } from './commands';
import { createMapAppleVerifier } from './apple';
import { createFamilyStore } from './store';
import { createMemoryFamilyRepository } from './repository';
import { createSqliteFamilyRepository } from './sqlite-repository';
import { openFamilySqliteDatabase } from './node-db';
import { applyFamilyApiSchema } from './schema';
import type { AppleGrantService, AppleIdentity } from './types';

for(const sql of [false,true]) describe(sql?'SQLite capture':'memory capture',()=>{
 let db:ReturnType<typeof openFamilySqliteDatabase>|undefined;afterEach(async()=>{await db?.close();db=undefined;});
 async function fixture() {
  if(sql){db=openFamilySqliteDatabase(':memory:');await applyFamilyApiSchema(db);}
  const repository=sql?createSqliteFamilyRepository(db!):createMemoryFamilyRepository(createFamilyStore());const identities:Record<string,AppleIdentity>={};
  const exchange=jest.fn(async()=> 'refresh');const grants:AppleGrantService={exchange,seal:(userId,appleSubject)=>({userId,appleSubject,fingerprint:'test-fingerprint',ciphertext:'sealed',keyVersion:'v1',updatedAt:'2026-10-12T10:00:00Z'}),assertReadable:jest.fn(),revoke:jest.fn()};
  const commands=createFamilyCommands({repository,apple:createMapAppleVerifier(identities),appleLoginEnabled:true,publicTestLoginEnabled:true,appleGrants:grants});
  return {repository,identities,exchange,commands,grants};
 }
 it('requires a code, saves a grant against stable identity, and does not return it to the app',async()=>{
  const h=await fixture(),c=await h.commands.beginAppleAuth('login');expect(c.authorizationCodeRequired).toBe(true);h.identities.native={appleSubject:'subject',nonce:c.nonce};
  await expect(h.commands.completeAppleAuth({challengeId:c.challengeId,identityToken:'native'})).rejects.toMatchObject({code:'APPLE_GRANT_REQUIRED'});expect(h.exchange).not.toHaveBeenCalled();
  const result=await h.commands.completeAppleAuth({challengeId:c.challengeId,identityToken:'native',authorizationCode:'code'});expect('sessionToken' in result).toBe(true);expect(JSON.stringify(result)).not.toContain('sealed');
  expect((await h.repository.withTransaction(tx=>tx.findAppleGrant(result.userId)))?.appleSubject).toBe('subject');
  expect(h.exchange).toHaveBeenCalledWith({authorizationCode:'code',appleSubject:'subject',nonce:c.nonce});
 });
 it('exchange failure creates no account/grant/session and consumes the challenge',async()=>{
  const h=await fixture(),c=await h.commands.beginAppleAuth('login');h.identities.native={appleSubject:'subject',nonce:c.nonce};h.exchange.mockRejectedValueOnce(new Error('Apple down'));
  await expect(h.commands.completeAppleAuth({challengeId:c.challengeId,identityToken:'native',authorizationCode:'code'})).rejects.toThrow();
  expect(await h.repository.withTransaction(tx=>tx.findLoginIdentity('apple','subject'))).toBeNull();
  await expect(h.commands.completeAppleAuth({challengeId:c.challengeId,identityToken:'native',authorizationCode:'code'})).rejects.toMatchObject({code:'APPLE_TOKEN_INVALID'});
 });
 it('stale link after exchange never attaches or saves a grant',async()=>{
  const h=await fixture();await h.repository.withTransaction(async tx=>{await tx.saveAccount({userId:'a',createdAt:new Date().toISOString()});await tx.saveTestCredential({credentialId:'cred',userId:'a',loginNormalized:'a@example.com',passwordHash:'unused',enabled:true,operatorProvisioned:true,createdAt:new Date().toISOString()});await tx.saveSession({token:'session',userId:'a',expiresAt:new Date(Date.now()+60_000).toISOString()});});
  const c=await h.commands.beginAppleAuth('link','session');h.identities.native={appleSubject:'subject',nonce:c.nonce};let finish!:(token:string)=>void;h.exchange.mockImplementation(()=>new Promise(r=>{finish=r;}));
  const p=h.commands.completeAppleAuth({challengeId:c.challengeId,identityToken:'native',authorizationCode:'code'},'session');while(!h.exchange.mock.calls.length)await Promise.resolve();await h.commands.signOut('session');finish('refresh');
  await expect(p).rejects.toMatchObject({code:'UNAUTHENTICATED'});expect(await h.repository.withTransaction(tx=>tx.findAppleGrant('a'))).toBeNull();expect(await h.repository.withTransaction(tx=>tx.findLoginIdentity('apple','subject'))).toBeNull();
 });
});
