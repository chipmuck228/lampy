import { createAlbumFileEdition, openAlbumFile, saveAlbumFileArtifact } from './album-file-store';
import { manifestDigest as mockManifestDigest, type PrintManifest } from '../application/album-print';
import { makeAlbumFile } from '../application/album-file';
const mockHash='a'.repeat(64);
const mockSnapshot = {id:'print_one',version:1,name:'一册',createdAt:'2026-10-14',style:'plain',fonts:{serif:{fontName:'TimesNewRomanPSMT'},ui:{fontName:'PingFangSC-Regular'}},
 content:{album:{name:'一册',opening:null,cover:{kind:'words'}},entries:[{momentId:'original-private-id',note:'原文🙂',feeling:'平静',recordedAt:'2026-10-14',occurredAtPrecision:'unknown',media:[{assetId:'private-asset',role:'audio',durationMs:8000}]}]},
 media:[{assetId:'private-asset',file:'media-0',sha256:mockHash,bytes:100}],pdf:{sha256:mockHash,bytes:100}} as unknown as PrintManifest;
const mockDigest=jest.fn(async()=>({sha256:mockHash}));
const mockNativeSave=jest.fn(async()=>true);
const mockClose=jest.fn(async()=>undefined);
const mockPrepare=jest.fn(async()=>({sha256:mockHash,bytes:100}));
const mockPack=jest.fn(async()=>({uri:'file:///temp/edition.lampy',bytes:1000,sha256:mockHash}));
const mockOpen=jest.fn(async()=>({directory:'file:///temp/',manifest:JSON.stringify(makeAlbumFile(mockSnapshot,[{name:'album.pdf',sha256:mockHash,bytes:100},{name:'media-0.m4a',sha256:mockHash,bytes:100}])),hashes:{'album.pdf':mockHash,'media-0.m4a':mockHash}}));
const mockWrite=jest.fn(async(..._args: unknown[])=>undefined);
jest.mock('expo-file-system/legacy',()=>({documentDirectory:'file:///docs/',getFreeDiskStorageAsync:async()=>1e9,
  readAsStringAsync:async(path:string)=>path.endsWith('.sha256')?mockManifestDigest(mockSnapshot):JSON.stringify(mockSnapshot),
  writeAsStringAsync:(...args:unknown[])=>mockWrite(...args)}));
jest.mock('../../modules/lampy-album-layout',()=>({diagnoseAlbumFonts:()=>({serif:{fontName:'TimesNewRomanPSMT'},ui:{fontName:'PingFangSC-Regular'}}),albumArchiveNative:()=>({cleanAlbumArchiveSessions:async()=>undefined,beginAlbumArchive:async()=> 'file:///temp/',
  closeAlbumArchive:mockClose,prepareAlbumArchiveMedia:mockPrepare,saveAlbumArchive:mockNativeSave,packAlbumArchive:mockPack,openAlbumArchive:mockOpen}),
  albumPrintNative:()=>({printFileDigest:mockDigest,copyPrintMedia:async()=>({sha256:mockHash,bytes:100})})}));
beforeEach(()=>{jest.clearAllMocks();mockDigest.mockResolvedValue({sha256:mockHash});});
it('packs an existing frozen edition without original IDs, paths or account data',async()=>{
 const result=await createAlbumFileEdition('print_one',()=>true);expect(result.uri).toBe('file:///temp/edition.lampy');
 expect(mockPrepare).toHaveBeenCalledWith(expect.any(String),'file:///docs/album-print-evaluation/print_one/media-0','media-0.m4a','audio');
 const json=mockWrite.mock.calls[0][1] as string;expect(json).toContain('原文🙂');expect(json).not.toContain('original-private-id');expect(json).not.toContain('private-asset');expect(json).not.toContain('file:///');
 expect(mockClose).not.toHaveBeenCalled();
});
it('cancellation after a media task waits for completion then cleans its own session',async()=>{
 let valid=true;mockPrepare.mockImplementationOnce(async()=>{valid=false;return{sha256:mockHash,bytes:100};});
 await expect(createAlbumFileEdition('print_one',()=>valid)).rejects.toThrow('FILE_CANCELLED');expect(mockClose).toHaveBeenCalled();expect(mockPack).not.toHaveBeenCalled();
});
it('late external loads are discarded and never returned as a current book',async()=>{
 let valid=true;const original=mockOpen.getMockImplementation()!;mockOpen.mockImplementationOnce(async()=>{const result=await original();valid=false;return result;});
 await expect(openAlbumFile('file:///external.lampy','session',()=>valid)).rejects.toThrow('FILE_CANCELLED');expect(mockClose).toHaveBeenCalledWith('session');
});
it('corrupt external contents clean the read session',async()=>{
 mockOpen.mockResolvedValueOnce({directory:'file:///temp/',manifest:'{}',hashes:{'album.pdf':mockHash,'media-0.m4a':mockHash}});
 await expect(openAlbumFile('file:///external.lampy','session',()=>true)).rejects.toThrow();expect(mockClose).toHaveBeenCalledWith('session');
});

it('saving refuses a changed artifact before presenting a system picker',async()=>{
 mockDigest.mockResolvedValue({sha256:'b'.repeat(64)});
 await expect(saveAlbumFileArtifact({id:'session',name:'册',uri:'file:///tmp/book.lampy',bytes:100,sha256:mockHash},()=>true)).rejects.toThrow('FILE_CHANGED');
 expect(mockNativeSave).not.toHaveBeenCalled();
});
it('saving rechecks qualification after awaiting artifact integrity',async()=>{
 let valid=true;mockDigest.mockImplementationOnce(async()=>{valid=false;return{sha256:mockHash};});
 await expect(saveAlbumFileArtifact({id:'session',name:'册',uri:'file:///tmp/book.lampy',bytes:100,sha256:mockHash},()=>valid)).rejects.toThrow('FILE_CANCELLED');
 expect(mockNativeSave).not.toHaveBeenCalled();
});
