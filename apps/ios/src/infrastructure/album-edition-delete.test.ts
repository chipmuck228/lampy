import * as FS from 'expo-file-system/legacy';
import { deleteSavedAlbumEdition } from './album-edition-delete';
import { acquireAlbumEdition } from './album-edition-lock';
import { manifestDigest } from '../application/album-print';
jest.mock('expo-file-system/legacy',()=>({documentDirectory:'file:///docs/',readAsStringAsync:jest.fn(),deleteAsync:jest.fn(async()=>{})}));
jest.mock('./album-epub-snapshots',()=>({epubSnapshotActive:()=>false}));
beforeEach(()=>jest.clearAllMocks());
function seed(id:string,albumId='book') {
 const m={id,albumId,version:1,kind:id.startsWith('epub_')?'epub':undefined,media:[{uri:'file:///private/original'}]};
 (FS.readAsStringAsync as jest.Mock).mockImplementation(async(uri:string)=>uri.endsWith('manifest.json')?JSON.stringify(m):manifestDigest(m));
}
it.each(['epub_one','print_one'])('deletes only the verified %s directory and no original or other edition',async id=>{
 seed(id);await deleteSavedAlbumEdition(id,'book',()=>true);
 expect(FS.deleteAsync).toHaveBeenCalledTimes(1);
 expect(FS.deleteAsync).toHaveBeenCalledWith(`file:///docs/${id.startsWith('epub_')?'album-epub-editions':'album-print-evaluation'}/${id}/`,{idempotent:true});
});
it('rejects traversal, another album and changed manifests without deleting',async()=>{
 await expect(deleteSavedAlbumEdition('../a','book',()=>true)).rejects.toThrow('PRINT_INVALID_ID');
 seed('epub_one','other');await expect(deleteSavedAlbumEdition('epub_one','book',()=>true)).rejects.toThrow('PRINT_FILE_CHANGED');
 seed('epub_one');(FS.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify({id:'epub_one',albumId:'book',version:1,kind:'epub'})).mockResolvedValueOnce('changed');
 await expect(deleteSavedAlbumEdition('epub_one','book',()=>true)).rejects.toThrow('PRINT_FILE_CHANGED');expect(FS.deleteAsync).not.toHaveBeenCalled();
});
it('does not delete after backgrounding during validation',async()=>{
 seed('epub_one');let valid=true;
 (FS.readAsStringAsync as jest.Mock).mockImplementationOnce(async()=>{valid=false;return JSON.stringify({id:'epub_one'});});
 await expect(deleteSavedAlbumEdition('epub_one','book',()=>valid)).rejects.toThrow('CANCELLED');expect(FS.deleteAsync).not.toHaveBeenCalled();
});
it('refuses a busy edition and holds its lease until deletion finishes',async()=>{
 seed('epub_one');let release=acquireAlbumEdition('epub_one');
 await expect(deleteSavedAlbumEdition('epub_one','book',()=>true)).rejects.toThrow('EPUB_BUSY');release();
 let finish!:()=>void;(FS.deleteAsync as jest.Mock).mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
 const task=deleteSavedAlbumEdition('epub_one','book',()=>true);await Promise.resolve();await Promise.resolve();await Promise.resolve();
 expect(()=>acquireAlbumEdition('epub_one')).toThrow('EPUB_BUSY');finish();await task;
 release=acquireAlbumEdition('epub_one');release();
});
it('releases the lease after filesystem failure, allowing retry',async()=>{
 seed('epub_one');(FS.deleteAsync as jest.Mock).mockRejectedValueOnce(new Error('DISK_ERROR'));
 await expect(deleteSavedAlbumEdition('epub_one','book',()=>true)).rejects.toThrow('DISK_ERROR');
 await expect(deleteSavedAlbumEdition('epub_one','book',()=>true)).resolves.toBeUndefined();
});
