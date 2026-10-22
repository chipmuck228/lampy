import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openPreparedNodeSqliteDatabase} from './node-sqlite';
import {createNodeFamilyReceiveFiles} from './family-receive-files-node';
import {createSqliteFamilyReceiveCache} from './family-receive-cache';
import {sampleJpegBytes,sha256MediaBytes} from '../family-api/media-validate';
import type {ShareView} from '../family-api/types';
async function fixture(){
 const dir=await mkdtemp(path.join(tmpdir(),'lampy-index-cache-'));
 const db=await openPreparedNodeSqliteDatabase(path.join(dir,'app.db'));
 const files=createNodeFamilyReceiveFiles(path.join(dir,'cache'));
 const cache=createSqliteFamilyReceiveCache(db,files),bytes=sampleJpegBytes();
 const share:ShareView={shareId:'s',familyId:'f',authorUserId:'a',sourceMomentId:'m',sourceRevision:1,audienceUserIds:['u'],sharedAt:'2026-10-22T00:00:00Z',stored:'server',snapshot:{note:'test',emotion:'',occurredAtPrecision:'day',media:[1,2,3].map(n=>({objectId:`p${n}`,mimeType:'image/jpeg',byteLength:bytes.length})),origin:{type:'received',transmissionId:'s',originalMomentId:'m',snapshotRevision:1}}};
 await cache.beginReceive('u',share);
 for(const media of share.snapshot.media)await cache.saveStoredMedia({userId:'u',familyId:'f',shareId:'s',objectId:media.objectId,mimeType:media.mimeType,byteLength:bytes.length,contentSha256:sha256MediaBytes(bytes),storageKey:`u/f/s/${media.objectId}`,bytes});
 await cache.markReceived('u','f','s');
 return {db,files,cache,share,close:async()=>{await db.close();await rm(dir,{recursive:true,force:true});}};
}
it('refreshes an unchanged remote index repeatedly without reading or rewriting cached photo bytes',async()=>{
 const x=await fixture();
 try {
  const read=jest.spyOn(x.files,'read'),write=jest.spyOn(x.files,'write');
  for(let i=0;i<4;i++)await x.cache.replaceVisible('u','f',[x.share]);
  expect(read).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();
  expect((await x.cache.find('u','f','s'))?.receiveStatus).toBe('received');
 }finally{await x.close();}
});
it('keeps explicit disk reconciliation able to detect and demote corrupt files',async()=>{
 const x=await fixture();
 try {
  await x.files.write('u/f/s/p1',new Uint8Array([9]));
  await x.cache.replaceVisible('u','f',[x.share]);
  // Index synchronization is not a media-integrity check or permission grant.
  expect((await x.cache.find('u','f','s'))?.receiveStatus).toBe('received');
  expect((await x.cache.list('u','f'))[0].receiveStatus).toBe('listed');
 }finally{await x.close();}
});
it('still removes withdrawn index rows and their private cached files',async()=>{
 const x=await fixture();
 try {
  await x.cache.replaceVisible('u','f',[]);
  expect(await x.cache.find('u','f','s')).toBeNull();
  expect(await x.files.listKeys()).toEqual([]);
 }finally{await x.close();}
});
