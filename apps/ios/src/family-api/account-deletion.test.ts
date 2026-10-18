import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {sampleJpegBytes} from './media-validate';
import {createFamilyCommands} from './commands';
import {createMapAppleVerifier} from './apple';
import {createFamilyStore} from './store';
import {createMemoryFamilyRepository} from './repository';
import {createSqliteFamilyRepository} from './sqlite-repository';
import {openFamilySqliteDatabase} from './node-db';
import {applyFamilyApiSchema} from './schema';
import {createMemoryMediaBlobStore} from './media-blobs';
import {DELETE_ACCOUNT_CONFIRMATION,drainAccountMedia} from './account-deletion';
import type {AppleIdentity} from './types';
import {dispatchFamilyApi} from './http';
for(const sqlite of [false,true])describe(sqlite?'account deletion SQLite':'account deletion memory',()=>{
 let db:ReturnType<typeof openFamilySqliteDatabase>|undefined;
 afterEach(async()=>{await db?.close();});
 async function setup() {
  db=sqlite?openFamilySqliteDatabase(':memory:'):undefined;if(db)await applyFamilyApiSchema(db);
  const store=createFamilyStore(),repository=db?createSqliteFamilyRepository(db):createMemoryFamilyRepository(store);
  const identities:Record<string,AppleIdentity>={};const apple=createMapAppleVerifier(identities);
  let now=new Date();const blobs=createMemoryMediaBlobStore();const revoke=jest.fn(async()=>{});
  const commands=createFamilyCommands({repository,apple,appleRevoker:{revoke},appleLoginEnabled:true,clock:{now:()=>now},mediaBlobs:blobs,historySharingEnabled:true,familyAlbumsEnabled:true});
  async function login(subject:string) {
   const c=await commands.beginAppleAuth('login',undefined,subject);identities[subject]={appleSubject:subject,nonce:c.nonce};
   const result=await commands.completeAppleAuth({challengeId:c.challengeId,identityToken:subject});if(!('sessionToken'in result))throw Error('No session');return result;
  }
  async function deletion(session:string,subject:string) {
   const c=await commands.beginAppleAuth('delete',session);identities[subject]={appleSubject:subject,nonce:c.nonce};
   return {challengeId:c.challengeId,identityToken:subject,authorizationCode:'code',confirmation:DELETE_ACCOUNT_CONFIRMATION};
  }
  return {commands,repository,store,identities,login,deletion,blobs,revoke,expire:()=>{now=new Date(now.getTime()+300001);}};
 }
 it('removes identity, every session, snapshots, albums and media; same Apple creates a fresh account',async()=>{
  const h=await setup(),a=await h.login('a'),otherSession=await h.login('a');const family=await h.commands.createNamedFamily(a.sessionToken,'Home','create');
  await h.repository.withTransaction(async tx=>{
   await tx.saveProfile({userId:a.userId,nickname:'Private name',avatar:'system',updatedAt:'now'});
   await tx.saveMediaObject({objectId:'med_aa',storageKey:'med_aa',ownerUserId:a.userId,mimeType:'image/jpeg',byteLength:1,contentSha256:'hash',createdAt:'now'});
   await tx.saveShare({shareId:'share',familyId:family.familyId,authorUserId:a.userId,sourceMomentId:'moment',sourceRevision:1,snapshot:{note:'secret',emotion:'',occurredAtPrecision:'unknown',media:[{objectId:'med_aa',mimeType:'image/jpeg',byteLength:1}],origin:{type:'received',transmissionId:'tx',originalMomentId:'moment',snapshotRevision:1}},audienceUserIds:[a.userId],sharedAt:'now',status:'revoked'});
   await tx.saveFamilyAlbum({albumId:'album',familyId:family.familyId,name:'Secret',opening:'Opening',shareIds:['share'],revision:1,createdAt:'now',updatedAt:'now'});
   await tx.saveIdempotent(a.userId,'shareMoment','key',{requestFingerprint:'secret',status:200,body:{note:'secret'}});
  });
  await h.blobs.write('med_aa',new Uint8Array([1]));
  const input=await h.deletion(a.sessionToken,'a');const result=await h.commands.deleteAccount(a.sessionToken,input);
  expect(result).toEqual({deleted:true,appleRevocation:'revoked',mediaCleanup:'completed'});
  expect(h.revoke).toHaveBeenCalledWith('code','a',h.identities.a.nonce);expect(h.blobs.files.size).toBe(0);
  await h.repository.withTransaction(async tx=>{
   expect(await tx.findAccountByUserId(a.userId)).toBeNull();expect(await tx.listLoginIdentities(a.userId)).toEqual([]);
   expect(await tx.findProfile(a.userId)).toBeNull();expect(await tx.findShare('share')).toBeNull();expect(await tx.findMediaObject('med_aa')).toBeNull();
   expect(await tx.findFamilyAlbum('album')).toBeNull();expect(await tx.findIdempotent(a.userId,'shareMoment','key')).toBeNull();
  });
  await expect(h.commands.listFamilies(otherSession.sessionToken)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  await expect(h.commands.deleteAccount(a.sessionToken,input)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  const fresh=await h.login('a');expect(fresh.userId).not.toBe(a.userId);expect((await h.commands.listFamilies(fresh.sessionToken)).families).toEqual([]);
 });
 it('requires fresh matching Apple identity, explicit confirmation and a one-use deletion challenge',async()=>{
  const h=await setup(),a=await h.login('a');await h.login('b');const input=await h.deletion(a.sessionToken,'b');
  await expect(h.commands.deleteAccount(a.sessionToken,{...input,confirmation:''})).rejects.toMatchObject({code:'BAD_REQUEST'});
  await expect(h.commands.deleteAccount(a.sessionToken,input)).rejects.toMatchObject({code:'APPLE_TOKEN_INVALID'});
  await expect(h.commands.deleteAccount(a.sessionToken,input)).rejects.toMatchObject({code:'APPLE_TOKEN_INVALID'});
  const expired=await h.deletion(a.sessionToken,'a');h.expire();await expect(h.commands.deleteAccount(a.sessionToken,expired)).rejects.toMatchObject({code:'APPLE_TOKEN_INVALID'});
  expect(h.revoke).not.toHaveBeenCalled();expect((await h.commands.listFamilies(a.sessionToken)).families).toEqual([]);
 });
 it('refuses deleting a creator with other members; deleting a member preserves the family and other content',async()=>{
  const h=await setup(),a=await h.login('a'),b=await h.login('b');const family=await h.commands.createNamedFamily(a.sessionToken,'Home','create');
  const invite=await h.commands.inviteMember(a.sessionToken,family.familyId,'invite');await h.commands.acceptInvitation(b.sessionToken,invite.code,'accept');
  await expect(h.commands.deleteAccount(a.sessionToken,await h.deletion(a.sessionToken,'a'))).rejects.toMatchObject({code:'ACCOUNT_HAS_MANAGED_FAMILY'});
  await h.repository.withTransaction(async tx=>{
   for(const [id,author]of [['keep',a.userId],['remove',b.userId]])await tx.saveShare({shareId:id,familyId:family.familyId,authorUserId:author,sourceMomentId:id,sourceRevision:1,snapshot:{note:id,emotion:'',occurredAtPrecision:'unknown',media:[],origin:{type:'received',transmissionId:id,originalMomentId:id,snapshotRevision:1}},audienceUserIds:[a.userId,b.userId],sharedAt:'now',status:'active'});
   await tx.saveFamilyAlbum({albumId:'family-book',familyId:family.familyId,name:'Family',opening:'Opening',shareIds:['keep','remove'],coverChoice:{shareId:'remove',objectId:'med_bb'},revision:1,createdAt:'now',updatedAt:'now'});
  });
  await h.commands.deleteAccount(b.sessionToken,await h.deletion(b.sessionToken,'b'));
  await h.repository.withTransaction(async tx=>{
   expect((await tx.findShare('keep'))?.snapshot.note).toBe('keep');expect((await tx.findShare('keep'))?.audienceUserIds).toEqual([a.userId]);expect(await tx.findShare('remove')).toBeNull();
   expect(await tx.findFamilyAlbum('family-book')).toMatchObject({name:'Family',shareIds:['keep'],coverChoice:null,revision:2});
  });
  expect((await h.commands.listFamilies(a.sessionToken)).families[0]).toMatchObject({familyId:family.familyId,memberCount:1});
 });
 it('Apple outage does not block account deletion, while failed file removal stays queued for retry',async()=>{
  const h=await setup(),a=await h.login('a');h.revoke.mockRejectedValueOnce(Error('Apple down'));
  await h.repository.withTransaction(tx=>tx.saveMediaObject({objectId:'med_aa',storageKey:'med_aa',ownerUserId:a.userId,mimeType:'audio/mp4',byteLength:1,contentSha256:'hash',createdAt:'now'}));
  await h.blobs.write('med_aa',new Uint8Array([1]));const remove=jest.spyOn(h.blobs,'remove').mockRejectedValueOnce(Error('disk busy'));
  const result=await h.commands.deleteAccount(a.sessionToken,await h.deletion(a.sessionToken,'a'));
  expect(result).toMatchObject({appleRevocation:'manual-required',mediaCleanup:'pending'});
  expect(await h.repository.withTransaction(tx=>tx.findMediaObject('med_aa'))).toBeNull();
  remove.mockRestore();await drainAccountMedia(h.repository,h.blobs);expect(h.blobs.files.size).toBe(0);
 });
 it('rechecks family membership after external Apple work before committing deletion',async()=>{
  const h=await setup(),a=await h.login('a'),b=await h.login('b');const family=await h.commands.createNamedFamily(a.sessionToken,'Home','create');
  h.revoke.mockImplementationOnce(async()=>{const invite=await h.commands.inviteMember(a.sessionToken,family.familyId,'race-invite');await h.commands.acceptInvitation(b.sessionToken,invite.code,'race-accept');});
  await expect(h.commands.deleteAccount(a.sessionToken,await h.deletion(a.sessionToken,'a'))).rejects.toMatchObject({code:'ACCOUNT_HAS_MANAGED_FAMILY'});
  expect((await h.commands.listFamilies(a.sessionToken)).families[0].memberCount).toBe(2);
 });
 it('upload completing after deletion cannot restore media and failed disposal is queued',async()=>{
  const h=await setup(),a=await h.login('a');
  let finish!:()=>void,started!:()=>void;const begun=new Promise<void>(r=>{started=r;});
  const write=h.blobs.write;
  jest.spyOn(h.blobs,'write').mockImplementation(async(key,bytes)=>{await write(key,bytes);started();await new Promise<void>(r=>{finish=r;});});
  const upload=h.commands.uploadMedia(a.sessionToken,{bytes:sampleJpegBytes(),mimeType:'image/jpeg'});
  await begun;await h.commands.deleteAccount(a.sessionToken,await h.deletion(a.sessionToken,'a'));
  jest.spyOn(h.blobs,'remove').mockRejectedValueOnce(Error('disk busy'));
  finish();await expect(upload).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  expect(await h.repository.withTransaction(tx=>tx.listAccountMediaCleanup())).toHaveLength(1);
  await drainAccountMedia(h.repository,h.blobs);expect(h.blobs.files.size).toBe(0);
 });
 it('deletion challenge cannot be exchanged for a login session; HTTP requires authentication',async()=>{
  const h=await setup(),a=await h.login('a');const input=await h.deletion(a.sessionToken,'a');
  await expect(h.commands.completeAppleAuth(input,a.sessionToken)).rejects.toMatchObject({code:'APPLE_TOKEN_INVALID'});
  const result=await dispatchFamilyApi(h.commands,{method:'POST',path:'/v2/me/account/delete',headers:{},body:input});expect(result.status).toBe(401);
 });
});

describe('durable deletion queue after restart',()=>{
 it('retains only the storage key after account removal and retries after reopening',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'lampy-delete-'));const file=path.join(dir,'db');let db=openFamilySqliteDatabase(file);
  try {
   await applyFamilyApiSchema(db);let repo=createSqliteFamilyRepository(db);
   await repo.withTransaction(async tx=>{await tx.saveAccount({userId:'a',appleSubject:'apple',createdAt:'now'});await tx.saveMediaObject({objectId:'med_aa',storageKey:'med_aa',ownerUserId:'a',mimeType:'image/jpeg',byteLength:1,contentSha256:'hash',createdAt:'now'});await tx.purgeAccount('a');});
   await db.close();db=openFamilySqliteDatabase(file);repo=createSqliteFamilyRepository(db);
   expect(await repo.withTransaction(tx=>tx.findAccountByUserId('a'))).toBeNull();expect(await repo.withTransaction(tx=>tx.listAccountMediaCleanup())).toEqual(['med_aa']);
   const blobs=createMemoryMediaBlobStore();await blobs.write('med_aa',new Uint8Array([1]));expect(await drainAccountMedia(repo,blobs)).toBe(true);expect(blobs.files.size).toBe(0);
   expect(await repo.withTransaction(tx=>tx.listAccountMediaCleanup())).toEqual([]);
  }finally{await db.close();rmSync(dir,{recursive:true,force:true});}
 });
});
it('migration 32 rolls back challenge replacement on failure and preserves pending login challenges',async()=>{
 const db=openFamilySqliteDatabase(':memory:');
 try {
  await applyFamilyApiSchema(db,{upTo:31});
  await db.run("INSERT INTO family_apple_challenges(id,nonce,intent,expires_at) VALUES('id','nonce','login','future')");
  await expect(applyFamilyApiSchema({...db,run:async(sql,args)=>{if(sql.includes('family_schema_migrations')&&args?.[0]===32)throw Error('disk full');return db.run(sql,args);}})).rejects.toThrow('disk full');
  expect(await db.getFirst('SELECT MAX(version) AS version FROM family_schema_migrations')).toEqual({version:31});
  expect(await db.getFirst("SELECT intent FROM family_apple_challenges WHERE id='id'")).toEqual({intent:'login'});
  await applyFamilyApiSchema(db);expect(await db.getFirst("SELECT intent FROM family_apple_challenges WHERE id='id'")).toEqual({intent:'login'});
  await db.run("INSERT INTO family_apple_challenges(id,nonce,intent,expires_at) VALUES('delete','delete-nonce','delete','future')");
 }finally{await db.close();}
});
