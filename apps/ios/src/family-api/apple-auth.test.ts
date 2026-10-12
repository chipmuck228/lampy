import { createFamilyCommands } from './commands';
import { createMapAppleVerifier, createAppleJwksVerifier } from './apple';
import { createFamilyStore } from './store';
import { createMemoryFamilyRepository } from './repository';
import { applyFamilyApiSchema } from './schema';
import { openFamilySqliteDatabase } from './node-db';
import { createSqliteFamilyRepository } from './sqlite-repository';
import type { AppleIdentity } from './types';
import { dispatchFamilyApi } from './http';

function harness(repository = createMemoryFamilyRepository(createFamilyStore())) {
  let now = new Date('2026-10-11T12:00:00Z');const identities:Record<string,AppleIdentity>={};
  const commands=createFamilyCommands({repository,apple:createMapAppleVerifier(identities),publicTestLoginEnabled:true,appleLoginEnabled:true,clock:{now:()=>now}});
  async function login(subject='a',email='same@example.com') {
    const c=await commands.beginAppleAuth('login',undefined,subject);identities[subject]={appleSubject:subject,email,nonce:c.nonce};
    const result=await commands.completeAppleAuth({challengeId:c.challengeId,identityToken:subject});
    if(!('sessionToken' in result)) throw new Error('No session');return result;
  }
  return {commands,repository,identities,login,advance:()=>{now=new Date(now.getTime()+300_001);}};
}
for(const sqlite of [false,true]) describe(sqlite?'SQLite':'Memory',()=>{
  let db:ReturnType<typeof openFamilySqliteDatabase> | undefined;
  afterEach(async()=>{await db?.close();db=undefined;});
  async function setup(){if(!sqlite)return harness();db=openFamilySqliteDatabase(':memory:');await applyFamilyApiSchema(db);return harness(createSqliteFamilyRepository(db));}
  it('same Apple subject reuses account; equal email never merges; Apple session can read profile and family',async()=>{
    const h=await setup();const a=await h.login('a'),again=await h.login('a'),b=await h.login('b');
    expect(again.userId).toBe(a.userId);expect(b.userId).not.toBe(a.userId);
    await h.commands.updateMyProfile(a.sessionToken,'小禾');expect((await h.commands.getMyProfile(again.sessionToken)).nickname).toBe('小禾');
    await h.commands.createNamedFamily(a.sessionToken,'家','create-1');expect((await h.commands.listFamilies(again.sessionToken)).families).toHaveLength(1);
  });
  it('link keeps user/profile; other-account and replacement conflicts never merge',async()=>{
    const h=await setup();await h.repository.withTransaction(async tx=>{
      await tx.saveAccount({userId:'controlled',createdAt:'2026-10-11T12:00:00Z'});
      await tx.saveTestCredential({credentialId:'cred',userId:'controlled',loginNormalized:'test@example.com',passwordHash:'unused',enabled:true,operatorProvisioned:true,createdAt:'2026-10-11T12:00:00Z'});
      await tx.saveSession({userId:'controlled',token:'controlled-session',expiresAt:'2026-10-12T12:00:00Z'});
      await tx.saveProfile({userId:'controlled',nickname:'原昵称',avatar:'system',updatedAt:'2026-10-11T12:00:00Z'});
    });
    const c=await h.commands.beginAppleAuth('link','controlled-session');h.identities.new={appleSubject:'new',nonce:c.nonce};
    expect(await h.commands.completeAppleAuth({challengeId:c.challengeId,identityToken:'new'},'controlled-session')).toEqual({linked:true,userId:'controlled'});
    const a=await h.login('new');expect(a.userId).toBe('controlled');expect((await h.commands.getMyProfile(a.sessionToken)).nickname).toBe('原昵称');
    const b=await h.login('other');const conflict=await h.commands.beginAppleAuth('link',b.sessionToken);h.identities.new.nonce=conflict.nonce;
    await expect(h.commands.completeAppleAuth({challengeId:conflict.challengeId,identityToken:'new'},b.sessionToken)).rejects.toMatchObject({code:'CONFLICT'});
    expect((await h.commands.getAppleLink(a.sessionToken)).linked).toBe(true);
  });
  it('nonce mismatch, replay, concurrent completion and expiration fail',async()=>{
    const h=await setup();const c=await h.commands.beginAppleAuth('login');h.identities.bad={appleSubject:'a',nonce:'wrong'};
    await expect(h.commands.completeAppleAuth({challengeId:c.challengeId,identityToken:'bad'})).rejects.toMatchObject({code:'APPLE_TOKEN_INVALID'});
    h.identities.bad.nonce=c.nonce;await expect(h.commands.completeAppleAuth({challengeId:c.challengeId,identityToken:'bad'})).rejects.toMatchObject({code:'APPLE_TOKEN_INVALID'});
    const d=await h.commands.beginAppleAuth('login');h.identities.good={appleSubject:'a',nonce:d.nonce};
    const both=await Promise.allSettled([h.commands.completeAppleAuth({challengeId:d.challengeId,identityToken:'good'}),h.commands.completeAppleAuth({challengeId:d.challengeId,identityToken:'good'})]);expect(both.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const e=await h.commands.beginAppleAuth('login');h.advance();await expect(h.commands.completeAppleAuth({challengeId:e.challengeId,identityToken:'good'})).rejects.toMatchObject({code:'APPLE_TOKEN_INVALID'});
  });
  it('link requires same live session before and after JWT verification',async()=>{
    const h=await setup();const a=await h.login();const c=await h.commands.beginAppleAuth('link',a.sessionToken);const b=await h.login('b');
    await expect(h.commands.completeAppleAuth({challengeId:c.challengeId,identityToken:'a'},b.sessionToken)).rejects.toMatchObject({code:'APPLE_TOKEN_INVALID'});
    await h.commands.signOut(a.sessionToken);
    await expect(h.commands.completeAppleAuth({challengeId:c.challengeId,identityToken:'a'},a.sessionToken)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  });
});
it('closed by default; legacy Apple route remains closed for public test; challenge rate limit persists',async()=>{
 const h=harness();const closed=createFamilyCommands({repository:h.repository,apple:createMapAppleVerifier({}),publicTestLoginEnabled:true});
 await expect(closed.beginAppleAuth('login')).rejects.toMatchObject({code:'FORBIDDEN'});await expect(h.commands.signInWithApple('a')).rejects.toMatchObject({code:'FORBIDDEN'});
 for(let i=0;i<10;i++)await h.commands.beginAppleAuth('login',undefined,'peer');await expect(h.commands.beginAppleAuth('login',undefined,'peer')).rejects.toMatchObject({code:'RATE_LIMITED'});
 const response=await dispatchFamilyApi(h.commands,{method:'POST',path:'/v2/auth/apple/challenge',headers:{},body:{intent:'link'}});expect(response.status).toBe(401);
});

it('a link session revoked while verifying JWT cannot attach an identity',async()=>{
 const h=harness();const a=await h.login('a');const c=await h.commands.beginAppleAuth('link',a.sessionToken);
 let release!:(value:AppleIdentity)=>void;const verifying=new Promise<AppleIdentity>(r=>{release=r;});
 const commands=createFamilyCommands({repository:h.repository,apple:{verifyIdentityToken:()=>verifying},publicTestLoginEnabled:true,appleLoginEnabled:true,clock:{now:()=>new Date('2026-10-11T12:00:00Z')}});
 const p=commands.completeAppleAuth({challengeId:c.challengeId,identityToken:'token'},a.sessionToken);
 while(await h.repository.withTransaction(tx=>tx.findAppleChallenge(c.challengeId))) await Promise.resolve();
 await h.commands.signOut(a.sessionToken);release({appleSubject:'another',nonce:c.nonce});
 await expect(p).rejects.toMatchObject({code:'UNAUTHENTICATED'});
 expect(await h.repository.withTransaction(tx=>tx.findLoginIdentity('apple','another'))).toBeNull();
});

it('production verifier checks nonce in signed claims and rejects malformed tokens',async()=>{
 const token=(nonce:string)=>[Buffer.from(JSON.stringify({alg:'RS256',kid:'key'})).toString('base64url'),Buffer.from(JSON.stringify({iss:'https://appleid.apple.com',aud:'app.lampy.ios',sub:'a',exp:1791727200,nonce})).toString('base64url'),'AA'].join('.');
 const verifier=createAppleJwksVerifier({audience:'app.lampy.ios',clock:{now:()=>new Date('2026-10-11T12:00:00Z')},fetchJwks:async()=>[{kid:'key',kty:'RSA'}],verifySignature:async()=>true});
 await expect(verifier.verifyIdentityToken(token('expected'),'expected')).resolves.toMatchObject({appleSubject:'a'});
 await expect(verifier.verifyIdentityToken(token('wrong'),'expected')).rejects.toMatchObject({code:'APPLE_TOKEN_INVALID'});
 await expect(verifier.verifyIdentityToken('malformed','expected')).rejects.toMatchObject({code:'APPLE_TOKEN_INVALID'});
});

it('Apple cannot replace an already linked identity or bypass a disabled controlled account',async()=>{
 const h=harness();const a=await h.login('a');const c=await h.commands.beginAppleAuth('link',a.sessionToken);h.identities.other={appleSubject:'unowned',nonce:c.nonce};
 await expect(h.commands.completeAppleAuth({challengeId:c.challengeId,identityToken:'other'},a.sessionToken)).rejects.toMatchObject({code:'CONFLICT'});
 await h.repository.withTransaction(tx=>tx.saveTestCredential({credentialId:'cred',userId:a.userId,loginNormalized:'test@example.com',passwordHash:'unused',enabled:false,operatorProvisioned:true,createdAt:'2026-10-11T12:00:00Z'}));
 await expect(h.login('a')).rejects.toMatchObject({code:'AUTH_FAILED'});
});
