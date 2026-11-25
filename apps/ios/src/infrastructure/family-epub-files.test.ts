import {File} from 'expo-file-system';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {strToU8,strFromU8,unzipSync} from 'fflate';
import {shareFamilyEpub,listFamilyEpubs,deleteFamilyEpub} from './family-epub-files';
import {familyPaperScope} from '../application/family-album-paper';
import {createFamilyEpubPreview} from './family-epub-preview';
import type {FamilyAlbumView} from '../family-api/family-album-types';
const mockToU8=strToU8,mockFromU8=strFromU8;
const mockFiles=new Map<string,Uint8Array>(),mockValidate=jest.fn(),mockAuthorize=jest.fn(),mockShare=jest.fn(),mockPersonal=jest.fn();
const mockReadMedia=jest.fn(),mockPrepare=jest.fn();
const audio=new Uint8Array([0,0,0,16,102,116,121,112,77,52,65,32,0,0,0,0]);
const mockDigest=(b:Uint8Array)=>bytesToHex(sha256(b));
jest.mock('./family-album-paper',()=>({familyPaperReader:async()=>({albums:{validate:mockValidate,authorizeExport:mockAuthorize},readMedia:mockReadMedia,imageSize:async()=>({width:900,height:1200})})}));
jest.mock('./album-export-purchases',()=>({albumExportAccess:{assert:mockPersonal}}));
jest.mock('../application/container',()=>({getUseCases:jest.fn(()=>{throw Error('NO_PERSONAL_RECORDS');})}));
jest.mock('../../modules/lampy-album-layout',()=>({albumEpubNative:()=>({prepareImage:mockPrepare}),albumPrintNative:()=>({sharePrintPdf:mockShare,copyPrintMedia:async(from:string,to:string)=>{const b=mockFiles.get(from)!;mockFiles.set(to,b);return{bytes:b.length,sha256:mockDigest(b)};},printFileDigest:async(uri:string)=>{const b=mockFiles.get(uri)!;return{bytes:b.length,sha256:mockDigest(b)};}})}));
jest.mock('expo-file-system/legacy',()=>({documentDirectory:'file:///documents/',cacheDirectory:'file:///cache/',makeDirectoryAsync:jest.fn(async()=>{}),getFreeDiskStorageAsync:async()=>1e9,
 readDirectoryAsync:jest.fn(async(root:string)=>[...new Set([...mockFiles.keys()].filter(k=>k.startsWith(root)).map(k=>k.slice(root.length).split('/')[0]))]),
 getInfoAsync:jest.fn(async(uri:string)=>({exists:mockFiles.has(uri),size:mockFiles.get(uri)?.length})),
 readAsStringAsync:jest.fn(async(uri:string)=>mockFromU8(mockFiles.get(uri)!)),writeAsStringAsync:jest.fn(async(uri:string,text:string)=>{mockFiles.set(uri,mockToU8(text));}),
 copyAsync:jest.fn(async({from,to}:{from:string;to:string})=>{mockFiles.set(to,mockFiles.get(from)!);}),
 moveAsync:jest.fn(async({from,to}:{from:string;to:string})=>{for(const [key,b]of [...mockFiles])if(key===from||key.startsWith(from)){mockFiles.set(to+key.slice(from.length),b);mockFiles.delete(key);}}),
 deleteAsync:jest.fn(async(root:string)=>{for(const key of mockFiles.keys())if(key===root||key.startsWith(root.endsWith('/')?root:root+'/'))mockFiles.delete(key);})}));
jest.mock('expo-file-system',()=>({FileMode:{ReadOnly:'r',Truncate:'wt'},File:jest.fn()}));
function view():FamilyAlbumView{return{familyId:'family-secret',albumId:'album-secret',name:'Our days',opening:'Together',createdAt:'2026-10-01',updatedAt:'2026-10-01',revision:1,validation:'v1',cover:null,
 access:{userId:'viewer-secret',membershipId:'member-secret',familyId:'family-secret',role:'creator',canManage:true,canExport:true,authority:'a',rulesAcknowledged:true,rulesVersion:1},
 items:[{shareId:'share-secret',status:'active',share:{shareId:'share-secret',familyId:'family-secret',authorUserId:'author-secret',sourceMomentId:'source-secret',audienceUserIds:['viewer-secret'],sharedAt:'2026-10-01',stored:'server',authorNickname:'爸爸 & 妈妈',sourceRevision:1,snapshot:{note:'老虎和panda，各得其乐',emotion:'平静',occurredAtPrecision:'unknown',origin:{type:'received',transmissionId:'t-secret',originalMomentId:'source-secret',snapshotRevision:1},media:[{objectId:'voice-secret',mimeType:'audio/mp4',byteLength:16}]}}}]};}
const flags=['FAMILY_ALBUM_EXPORT_ENABLED','UNIFIED_PURCHASES','ALBUM_EXPORT_ENABLED','ALBUM_PAID_EXPORT_ENABLED'];
beforeEach(()=>{
 jest.clearAllMocks();mockFiles.clear();flags.forEach(k=>process.env['EXPO_PUBLIC_'+k]='1');mockValidate.mockReset().mockResolvedValue({valid:true});mockAuthorize.mockReset().mockResolvedValue({allowed:true,userId:'viewer-secret'});mockShare.mockReset().mockResolvedValue(true);
 mockFiles.set('file:///source.m4a',audio);mockReadMedia.mockReset().mockResolvedValue({userId:'viewer-secret',share:(view().items[0] as {share:unknown}).share,media:[{objectId:'voice-secret',mimeType:'audio/mp4',uri:'file:///source.m4a'}]});
 (File as unknown as jest.Mock).mockImplementation((uri:string)=>({create(){mockFiles.set(uri,new Uint8Array());},open(mode:string){let offset=0;if(mode==='wt')mockFiles.set(uri,new Uint8Array());return{readBytes(n:number){const b=mockFiles.get(uri)!.subarray(offset,offset+n);offset+=b.length;return b;},writeBytes(b:Uint8Array){const old=mockFiles.get(uri)!;const next=new Uint8Array(old.length+b.length);next.set(old);next.set(b,old.length);mockFiles.set(uri,next);},close(){}};}}));
});
afterEach(()=>flags.forEach(k=>delete process.env['EXPO_PUBLIC_'+k]));
it('previews the real Chronicle pages for a member without purchase or personal records',async()=>{
 const member=view();member.access={...member.access,canManage:false,canExport:false,role:'member'};
 const result=await createFamilyEpubPreview(member,()=>true);
 expect(result.pages.at(-1)?.name).toBe('archive');
 const all=[...mockFiles].filter(([p])=>p.startsWith(result.rootUri)).map(([,b])=>strFromU8(b)).join('');
 expect(all.replace(/<[^>]*>/g,'')).toContain('老虎和panda，各得其乐');expect(all).toContain('爸爸 &amp; 妈妈');expect(all).not.toContain('family-secret');expect(all).not.toContain('viewer-secret');
 expect(mockAuthorize).not.toHaveBeenCalled();expect(mockPersonal).not.toHaveBeenCalled();
 await result.dispose();expect([...mockFiles.keys()]).toEqual(['file:///source.m4a']);
});
it('freezes and packages an attributed offline EPUB, isolates history and requires fresh family authorization for cached sharing',async()=>{
 const book=view(),before=JSON.stringify(book),id=await shareFamilyEpub(book,()=>true);
 expect(JSON.stringify(book)).toBe(before);expect(mockPersonal).not.toHaveBeenCalled();expect(mockAuthorize.mock.calls.length).toBeGreaterThanOrEqual(4);
 const uri=mockShare.mock.calls[0][0],archive=unzipSync(mockFiles.get(uri)!);expect(archive['OEBPS/media/asset-0.m4a']).toEqual(audio);
 const docs=Object.keys(archive).filter(k=>k.endsWith('.xhtml')).map(k=>strFromU8(archive[k])).join('');expect(docs.replace(/<[^>]*>/g,'')).toContain('老虎和panda，各得其乐');expect(docs).not.toContain('family-secret');
 expect((await listFamilyEpubs(book,()=>true)).map(e=>e.id)).toEqual([id]);
 for(const changed of [{...book,familyId:'other'},{...book,albumId:'other'},{...book,access:{...book.access,userId:'other'}}])expect(await listFamilyEpubs(changed,()=>true)).toEqual([]);
 mockShare.mockClear();mockAuthorize.mockRejectedValueOnce(Error('PURCHASE_REQUIRED'));
 await expect(shareFamilyEpub(book,()=>true,undefined,id)).rejects.toThrow('PURCHASE_REQUIRED');expect(mockShare).not.toHaveBeenCalled();expect(mockFiles.has(uri)).toBe(true);
 const stale={...book,validation:'v2'};expect((await listFamilyEpubs(stale,()=>true))[0].stale).toBe(true);
 await expect(shareFamilyEpub(stale,()=>true,undefined,id)).rejects.toThrow();expect(mockShare).not.toHaveBeenCalled();expect(mockFiles.has(uri)).toBe(true);
 await deleteFamilyEpub(book,id,()=>true);expect(mockFiles.has(uri)).toBe(false);expect(mockFiles.has('file:///source.m4a')).toBe(true);
});
it.each(['PURCHASE_REQUIRED','NOT_FAMILY_CREATOR','FAMILY_ALBUM_CHANGED'])('does not download or build after server denial %s',async code=>{
 mockAuthorize.mockRejectedValueOnce(Error(code));await expect(shareFamilyEpub(view(),()=>true)).rejects.toThrow(code);expect(mockReadMedia).not.toHaveBeenCalled();expect(mockShare).not.toHaveBeenCalled();expect(mockFiles.size).toBe(1);
});
it('rejects account switches and withdrawal during download, removes caches and never shares',async()=>{
 let current=true;mockReadMedia.mockImplementationOnce(async()=>{current=false;return{userId:'viewer-secret',share:(view().items[0] as {share:unknown}).share,media:[]};});
 await expect(createFamilyEpubPreview(view(),()=>current)).rejects.toThrow();expect(mockShare).not.toHaveBeenCalled();expect([...mockFiles.keys()]).toEqual(['file:///source.m4a']);
 mockValidate.mockRejectedValueOnce(Error('FAMILY_ALBUM_CHANGED'));await expect(createFamilyEpubPreview(view(),()=>true)).rejects.toThrow('FAMILY_ALBUM_CHANGED');
});
it('keeps verified files when delivery fails and denies a revoked final share check',async()=>{
 mockShare.mockRejectedValueOnce(Error('SHARE_FAILED'));await expect(shareFamilyEpub(view(),()=>true)).rejects.toThrow();
 const rows=await listFamilyEpubs(view(),()=>true);expect(rows).toHaveLength(1);
 mockShare.mockClear();mockAuthorize.mockResolvedValueOnce({allowed:true}).mockResolvedValueOnce({allowed:true}).mockRejectedValueOnce(Error('NOT_IN_FAMILY'));
 await expect(shareFamilyEpub(view(),()=>true,undefined,rows[0].id)).rejects.toThrow('NOT_IN_FAMILY');expect(mockShare).not.toHaveBeenCalled();expect(await listFamilyEpubs(view(),()=>true)).toHaveLength(1);
});
it('keeps export closed without the unified server policy; free preview remains available',async()=>{
 process.env.EXPO_PUBLIC_UNIFIED_PURCHASES='0';await expect(shareFamilyEpub(view(),()=>true)).rejects.toThrow('FAMILY_ALBUM_EXPORT_CLOSED');
 const p=await createFamilyEpubPreview(view(),()=>true);expect(p.pages.length).toBeGreaterThan(3);await p.dispose();
 expect(mockAuthorize).not.toHaveBeenCalled();expect(familyPaperScope(view())).toContain('viewer-secret');
});
it('omits withdrawn references from preview and rejects an empty publication without restoring private content',async()=>{
 const partial=view();partial.items.push({shareId:'withdrawn-secret',status:'withdrawn'});
 const result=await createFamilyEpubPreview(partial,()=>true);
 expect([...mockFiles].filter(([p])=>p.startsWith(result.rootUri)).map(([,b])=>strFromU8(b)).join('')).not.toContain('withdrawn-secret');await result.dispose();
 const removed=view();removed.items=[{shareId:'withdrawn-secret',status:'withdrawn'}];await expect(createFamilyEpubPreview(removed,()=>true)).rejects.toMatchObject({code:'FAMILY_ALBUM_INCOMPLETE'});expect(mockAuthorize).not.toHaveBeenCalled();
});
