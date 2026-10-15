import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFamilyStore } from './store';
import { createMemoryFamilyRepository,type FamilyRepository } from './repository';
import { createSqliteFamilyRepository } from './sqlite-repository';
import { openFamilySqliteDatabase } from './node-db';
import { applyFamilyApiSchema } from './schema';
import { createFamilyCommands } from './commands';
import { createMapAppleVerifier } from './apple';
import { FAMILY_ALBUM_CONFIRMATION } from './family-album-types';
import { dispatchFamilyApi } from './http';
import { createFamilyApiClient } from '../infrastructure/family-http-client';
const clock={now:()=>new Date('2026-10-15T00:00:00Z')};
async function fixture(kind:'memory'|'sqlite') {
  let clean=async()=>{};let repository:FamilyRepository;let file='';
  if(kind==='sqlite') {
    const dir=await mkdtemp(path.join(tmpdir(),'lampy-album-e-'));file=path.join(dir,'family.db');
    const db=openFamilySqliteDatabase(file);await applyFamilyApiSchema(db);repository=createSqliteFamilyRepository(db);
    clean=async()=>{await db.close();await rm(dir,{recursive:true,force:true});};
  } else repository=createMemoryFamilyRepository(createFamilyStore());
  await repository.withTransaction(async tx=>{
    for(const userId of ['a','b','c']) {
      await tx.saveAccount({userId,appleSubject:userId,createdAt:'2026-10-01'});
      await tx.saveSession({userId,token:userId,expiresAt:'2027-01-01'});
      await tx.saveProfile({userId,nickname:`家人${userId}`,avatar:'system',updatedAt:'2026-10-01'});
    }
    for(const familyId of ['f','other'])await tx.saveFamily({familyId,status:'active',createdAt:'2026-10-01',historyPolicy:'family-history-v2'});
    for(const [userId,role] of [['a','creator'],['b','member']] as const)await tx.saveMembership({familyId:'f',membershipId:`m-${userId}`,userId,role,status:'active',joinedAt:'2026-10-01'});
    await tx.saveMembership({familyId:'other',membershipId:'m-c',userId:'c',role:'creator',status:'active',joinedAt:'2026-10-01'});
    await tx.saveMediaObject({objectId:'photo',ownerUserId:'b',mimeType:'image/png',byteLength:10,contentSha256:'a'.repeat(64),storageKey:'photo',createdAt:'2026-10-01'});
    for(const [shareId,familyId] of [['s1','f'],['s2','f'],['foreign','other']])await tx.saveShare({shareId,familyId,authorUserId:familyId==='f'?'b':'c',sourceMomentId:shareId,sourceRevision:1,
      snapshot:{note:`原文${shareId}🙂`,emotion:'平静',occurredAtPrecision:'unknown',media:shareId==='s1'?[{objectId:'photo',mimeType:'image/png',byteLength:10}]:[],origin:{type:'received',transmissionId:shareId,originalMomentId:shareId,snapshotRevision:1}},audienceUserIds:['a','b'],sharedAt:'2026-10-01T01:00:00Z',status:'active'});
  });
  const commands=createFamilyCommands({repository,clock,apple:createMapAppleVerifier({}),historySharingEnabled:true,familyAlbumsEnabled:true});
  const acknowledge=async(user='a')=>{const access=await commands.albums.access(user,'f');return commands.albums.acknowledge(user,'f',access.membershipId,FAMILY_ALBUM_CONFIRMATION);};
  const create=async()=>{const access=await acknowledge();return commands.albums.create('a','f',{authority:access.authority,requestId:'operation',name:'家里的日子',opening:null});};
  return {repository,commands,acknowledge,create,clean,file};
}
describe.each(['memory','sqlite'] as const)('family album commands on %s',kind=>{
 it('keeps only ordered share references; all is a finite snapshot and create retries are idempotent',async()=>{
  const f=await fixture(kind);try {
   const book=await f.create();expect((await f.create()).albumId).toBe(book.albumId);
   const collected=await f.commands.albums.mutate('a','f',book.albumId,{authority:book.access.authority,revision:book.revision,change:{kind:'collect',shareIds:'all'}});
   expect(collected.items.map(item=>item.shareId)).toEqual(['s1','s2']);expect(collected.cover).toEqual({shareId:'s1',objectId:'photo'});
   await f.repository.withTransaction(async tx=>{const original=(await tx.findShare('s2'))!;await tx.saveShare({...original,shareId:'later',sourceMomentId:'later',sharedAt:'2026-10-15'});});
   expect((await f.commands.albums.read('a','f',book.albumId)).items).toHaveLength(2);
   const stored=await f.repository.withTransaction(tx=>tx.findFamilyAlbum(book.albumId));expect(JSON.stringify(stored)).not.toContain('原文');
   expect(collected.items[0].status==='active'&&collected.items[0].share.authorNickname).toBe('家人b');expect(collected.access.canExport).toBe(false);
  }finally{await f.clean();}
 });
 it('requires current member rules, rejects ordinary-member writes, cross-family references and stale revisions',async()=>{
  const f=await fixture(kind);try {
   await expect(f.commands.albums.list('a','f')).rejects.toMatchObject({code:'FAMILY_ALBUM_RULES_REQUIRED'});
   const book=await f.create();await f.acknowledge('b');
   await expect(f.commands.albums.mutate('b','f',book.albumId,{authority:book.access.authority,revision:1,change:{kind:'collect',shareIds:['s1']}})).rejects.toMatchObject({code:'FORBIDDEN'});
   await expect(f.commands.albums.mutate('a','f',book.albumId,{authority:book.access.authority,revision:1,change:{kind:'collect',shareIds:['s1','foreign']}})).rejects.toMatchObject({code:'SHARE_NOT_FOUND'});
   expect((await f.commands.albums.read('a','f',book.albumId)).items).toHaveLength(0);
   await expect(f.commands.albums.read('c','other',book.albumId)).rejects.toMatchObject({code:'FAMILY_ALBUM_RULES_REQUIRED'});
   await f.commands.albums.acknowledge('c','other','m-c',FAMILY_ALBUM_CONFIRMATION);
   await expect(f.commands.albums.read('c','other',book.albumId)).rejects.toMatchObject({code:'FAMILY_ALBUM_NOT_FOUND'});
   await expect(f.commands.albums.mutate('a','f',book.albumId,{authority:book.access.authority,revision:0,change:{kind:'collect',shareIds:[]}})).rejects.toMatchObject({code:'FAMILY_ALBUM_CHANGED'});
  }finally{await f.clean();}
 });
 it('revocation strips original text and cover, invalidates validation, and prevents collecting stale sources',async()=>{
  const f=await fixture(kind);try {
   const book=await f.create();const collected=await f.commands.albums.mutate('a','f',book.albumId,{authority:book.access.authority,revision:1,change:{kind:'collect',shareIds:['s1']}});
   await f.commands.historyShares.revokeShare('b','f','s1');
   const after=await f.commands.albums.read('a','f',book.albumId);expect(after.cover).toBeNull();expect(after.items).toEqual([{shareId:'s1',status:'withdrawn'}]);expect(JSON.stringify(after)).not.toContain('原文s1');
   await expect(f.commands.albums.validate('a','f',book.albumId,collected.validation)).rejects.toMatchObject({code:'FAMILY_ALBUM_CHANGED'});
   await expect(f.commands.albums.mutate('a','f',book.albumId,{authority:after.access.authority,revision:after.revision,change:{kind:'collect',shareIds:['s1']}})).rejects.toMatchObject({code:'SHARE_NOT_FOUND'});
  }finally{await f.clean();}
 });
 it('creator transfer changes the authority token, including a later transfer back',async()=>{
  const f=await fixture(kind);try {
   const book=await f.create();await f.acknowledge('b');
   const transfer=await f.commands.transfers.create('a','f',{requestId:'give',fromMembershipId:'m-a',toMembershipId:'m-b'});
   await f.commands.transfers.respond('b','f',transfer.transferId,transfer.revision,'accept');
   await expect(f.commands.albums.mutate('a','f',book.albumId,{authority:book.access.authority,revision:1,change:{kind:'collect',shareIds:[]}})).rejects.toMatchObject({code:'FORBIDDEN'});
   const current=await f.commands.albums.read('b','f',book.albumId);expect(current.access.canManage).toBe(true);
   const back=await f.commands.transfers.create('b','f',{requestId:'back',fromMembershipId:'m-b',toMembershipId:'m-a'});
   await f.commands.transfers.respond('a','f',back.transferId,back.revision,'accept');
   await expect(f.commands.albums.mutate('a','f',book.albumId,{authority:book.access.authority,revision:1,change:{kind:'collect',shareIds:[]}})).rejects.toMatchObject({code:'FAMILY_ALBUM_AUTHORITY_CHANGED'});
  }finally{await f.clean();}
 });
 it('removal, rejoin, sign-out and dissolution cannot reuse earlier access or acknowledgments',async()=>{
  const f=await fixture(kind);try {
   const book=await f.create();await f.acknowledge('b');
   await f.commands.removeSelectedMember('a','f','b','m-b');
   await expect(f.commands.albums.read('b','f',book.albumId)).rejects.toMatchObject({code:'NOT_IN_FAMILY'});
   await f.repository.withTransaction(tx=>tx.saveMembership({familyId:'f',membershipId:'m-b-new',userId:'b',role:'member',status:'active',joinedAt:'2026-10-15'}));
   expect((await f.commands.albums.access('b','f')).rulesAcknowledged).toBe(false);
   await f.commands.signOut('b');await expect(f.commands.albums.access('b','f')).rejects.toMatchObject({code:'UNAUTHENTICATED'});
   await f.commands.dissolveFamily('a','f','m-a');await expect(f.commands.albums.read('a','f',book.albumId)).rejects.toMatchObject({code:'NOT_IN_FAMILY'});
  }finally{await f.clean();}
 });
});
it('HTTP remains closed by default and does not expose anonymous album data',async()=>{
 const f=await fixture('memory');try {
  const closed=createFamilyCommands({repository:f.repository,clock,apple:createMapAppleVerifier({})});
  expect((await dispatchFamilyApi(closed,{method:'GET',path:'/v2/families/f/albums',headers:{authorization:'Bearer a'}})).status).toBe(503);
  expect((await dispatchFamilyApi(f.commands,{method:'GET',path:'/v2/families/f/albums',headers:{}})).status).toBe(401);
 }finally{await f.clean();}
});

it('independent SQLite connections share persistent albums and serialize conflicting writes',async()=>{
 const f=await fixture('sqlite');const secondDb=openFamilySqliteDatabase(f.file);
 const other=createFamilyCommands({repository:createSqliteFamilyRepository(secondDb),clock,apple:createMapAppleVerifier({}),historySharingEnabled:true,familyAlbumsEnabled:true});
 try {
  const book=await f.create();expect((await other.albums.list('a','f')).albums[0].albumId).toBe(book.albumId);
  const inputs={authority:book.access.authority,revision:1,change:{kind:'collect' as const,shareIds:['s1']}};
  const results=await Promise.allSettled([f.commands.albums.mutate('a','f',book.albumId,inputs),other.albums.mutate('a','f',book.albumId,inputs)]);
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  const rejected=results.find(result=>result.status==='rejected');expect(rejected?.status==='rejected'&&rejected.reason.code).toBe('FAMILY_ALBUM_CHANGED');
  const before=await other.albums.read('a','f',book.albumId);await f.commands.historyShares.revokeShare('b','f','s1');
  expect((await other.albums.read('a','f',book.albumId)).items).toEqual([{shareId:'s1',status:'withdrawn'}]);
  await expect(other.albums.validate('a','f',book.albumId,before.validation)).rejects.toMatchObject({code:'FAMILY_ALBUM_CHANGED'});
 }finally{await secondDb.close();await f.clean();}
});

it('migration 30 rolls back together and preserves all earlier migrations and shares',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'lampy-album-migration-'));const db=openFamilySqliteDatabase(path.join(dir,'f.db'));
 try {
  await applyFamilyApiSchema(db,{upTo:29});
  const before=await db.getAll('SELECT * FROM family_schema_migrations');
  await expect(applyFamilyApiSchema({...db,run:async(sql,params)=>{
   if(sql.includes('family_schema_migrations')&&params?.[0]===30)throw new Error('interrupted');return db.run(sql,params);
  }})).rejects.toThrow('interrupted');
  expect(await db.getFirst("SELECT name FROM sqlite_master WHERE name='family_albums'")).toBeNull();
  expect(await db.getAll('SELECT * FROM family_schema_migrations')).toEqual(before);
  await applyFamilyApiSchema(db);
  expect(await db.getAll('SELECT * FROM family_schema_migrations WHERE version<=29')).toEqual(before);
 }finally{await db.close();await rm(dir,{recursive:true,force:true});}
});


it('runs client transport through HTTP for rule receipt, collection, reordering and withdrawn reads',async()=>{
 const f=await fixture('sqlite');try {
  const api=createFamilyApiClient({request:input=>dispatchFamilyApi(f.commands,{method:input.method,path:input.path,headers:{authorization:`Bearer ${input.sessionToken}`},body:input.body})}).albums!;
  const access=await api.access('a','f');await api.acknowledge('a','f',access.membershipId,FAMILY_ALBUM_CONFIRMATION);
  const book=await api.create('a','f',{requestId:'http',authority:access.authority,name:'HTTP book',opening:'Opening'});
  expect((await api.sources('a','f')).shares).toHaveLength(2);
  const collected=await api.mutate('a','f',book.albumId,{authority:access.authority,revision:1,change:{kind:'collect',shareIds:['s2','s1']}});
  expect(collected.items.map(item=>item.shareId)).toEqual(['s2','s1']);
  const reordered=await api.mutate('a','f',book.albumId,{authority:access.authority,revision:collected.revision,change:{kind:'reorder',shareIds:['s1','s2']}});
  expect(reordered.items.map(item=>item.shareId)).toEqual(['s1','s2']);
  await api.validate('a','f',book.albumId,reordered.validation);
  await f.commands.historyShares.revokeShare('b','f','s1');
  await expect(api.validate('a','f',book.albumId,reordered.validation)).rejects.toMatchObject({code:'FAMILY_ALBUM_CHANGED'});
  expect((await api.read('a','f',book.albumId)).items[0]).toEqual({shareId:'s1',status:'withdrawn'});
  expect((await api.list('a','f')).albums).toHaveLength(1);
 }finally{await f.clean();}
});
