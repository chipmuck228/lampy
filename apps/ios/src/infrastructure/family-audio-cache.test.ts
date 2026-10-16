import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {openPreparedNodeSqliteDatabase} from './node-sqlite';
import {createNodeFamilyReceiveFiles} from './family-receive-files-node';
import {createSqliteFamilyReceiveCache,familyReceivedMediaKey} from './family-receive-cache';
import {sampleAudioBytes,sha256MediaBytes} from '../family-api/media-validate';
it('uses typed audio filenames without changing photo paths or account namespaces',()=>{
 const scope={userId:'u',familyId:'f',shareId:'s',objectId:'o'};expect(familyReceivedMediaKey({...scope,mimeType:'audio/mp4'})).toBe('u/f/s/o.m4a');expect(familyReceivedMediaKey({...scope,mimeType:'image/jpeg'})).toBe('u/f/s/o');expect(familyReceivedMediaKey({...scope,userId:'v',mimeType:'audio/mp4'})).toBe('v/f/s/o.m4a');
});
it('repairs extensionless audio in persistent SQLite and removes both filenames on isolation',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'lampy-family-audio-'));const db=await openPreparedNodeSqliteDatabase(path.join(dir,'app.db'));const files=createNodeFamilyReceiveFiles(path.join(dir,'cache'));const cache=createSqliteFamilyReceiveCache(db,files);
 try{
  const bytes=sampleAudioBytes();const input={userId:'u',familyId:'f',shareId:'s',objectId:'o',mimeType:'audio/mp4',byteLength:bytes.length,contentSha256:sha256MediaBytes(bytes),storageKey:'u/f/s/o',bytes};
  const first=await cache.saveStoredMedia(input);expect(first.storageKey).toBe('u/f/s/o.m4a');expect(await files.read(first.storageKey)).toEqual(bytes);
  await files.write(input.storageKey,bytes);await files.remove(first.storageKey);await db.run('UPDATE family_received_media SET storage_key=? WHERE user_id=?',[input.storageKey,'u']);
  const restored=createSqliteFamilyReceiveCache(db,files);expect((await restored.listMedia('u','f','s'))[0].storageKey).toBe(input.storageKey);
  const next=await restored.saveStoredMedia(input);expect(next.storageKey).toBe(first.storageKey);expect(await files.read(next.storageKey)).toEqual(bytes);expect(await files.listKeys()).toEqual([first.storageKey]);
  await restored.isolateShare('u','f','s');expect(await files.listKeys()).toEqual([]);
 }finally{await db.close();await rm(dir,{recursive:true,force:true});}
});
