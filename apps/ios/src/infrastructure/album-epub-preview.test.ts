import {createAlbumEpubPreview} from './album-epub-preview';
import * as FS from 'expo-file-system/legacy';
const mockFiles=new Map<string,string>(),mockRead=jest.fn(),mockPrepare=jest.fn();
const mockAssert=jest.fn(),mockShare=jest.fn();
jest.mock('../application/container',()=>({getUseCases:async()=>({readAlbumForContinuousReading:mockRead})}));
jest.mock('./album-export-purchases',()=>({albumExportAccess:{assert:mockAssert}}));
jest.mock('../../modules/lampy-album-layout',()=>({albumEpubNative:()=>({prepareImage:mockPrepare}),albumPrintNative:()=>({sharePrintPdf:mockShare})}));
jest.mock('expo-file-system/legacy',()=>({cacheDirectory:'file:///cache/',makeDirectoryAsync:jest.fn(async()=>{}),getFreeDiskStorageAsync:async()=>1e9,copyAsync:jest.fn(async({to}:{to:string})=>{mockFiles.set(to,'audio');}),moveAsync:jest.fn(async({from,to}:{from:string;to:string})=>{mockFiles.set(to,mockFiles.get(from)!);mockFiles.delete(from);}),writeAsStringAsync:jest.fn(async(path:string,text:string)=>{mockFiles.set(path,text);}),deleteAsync:jest.fn(async(path:string)=>{for(const key of mockFiles.keys())if(key.startsWith(path))mockFiles.delete(key);})}));
jest.mock('expo-file-system',()=>({FileMode:{ReadOnly:0},File:class{open(){return{readBytes:()=>new Uint8Array([0,0,0,24,102,116,121,112,77,52,65,32,0,0,0,0]),close:()=>{}};}}}));
const input={album:{id:'book',schemaVersion:1,name:'Synthetic preview',opening:'开篇',cover:{kind:'words'},entries:[],createdAt:'',updatedAt:''},entries:[{momentId:'m',collectedAt:'',sourceRevisionAtCollect:1,presence:'ready',revision:1,note:'完整文字 & 声音',feeling:'平静',occurredAtPrecision:'unknown',recordedAt:'',media:[{assetId:'p',role:'image',availability:'available',uri:'file:///original.jpg',intrinsicRatio:1,durationMs:null},{assetId:'a',role:'audio',availability:'available',uri:'file:///original.m4a',intrinsicRatio:null,durationMs:1000}]}]};
beforeEach(()=>{mockFiles.clear();jest.clearAllMocks();mockRead.mockImplementation(async()=>({input}));mockPrepare.mockImplementation(async(_source:string,dest:string)=>{mockFiles.set(dest,'image');return{extension:'jpg',mime:'image/jpeg',bytes:10,width:1200,height:900};});});
it('builds the real full EPUB pages for free in a disposable cache, never a saved/shared edition',async()=>{
 const original=JSON.stringify(input),result=await createAlbumEpubPreview('book',()=>true);
 expect(result.pages[0].name).toBe('cover');expect(result.pages.at(-1)!.name).toBe('archive');expect(result.pages.length).toBeGreaterThan(3);
 expect(mockFiles.get(result.rootUri+'OEBPS/record-1.xhtml')).toContain('完整文字 &amp; 声音');expect(mockFiles.get(result.rootUri+'OEBPS/photo-viewer.js')).toContain('photo-return');
 expect([...mockFiles.keys()].some(k=>k.endsWith('.epub')||k.includes('/Documents/'))).toBe(false);
 expect(mockAssert).not.toHaveBeenCalled();expect(mockShare).not.toHaveBeenCalled();expect(JSON.stringify(input)).toBe(original);
 await result.dispose();expect(mockFiles.size).toBe(0);expect(FS.deleteAsync).toHaveBeenCalledWith(result.rootUri,{idempotent:true});
});
it('cancels preparation and removes only its own cache',async()=>{
 mockFiles.set('file:///original.jpg','source');mockFiles.set('file:///documents/album.epub','saved');
 let valid=true;mockPrepare.mockImplementationOnce(async(_source,dest)=>{mockFiles.set(dest,'image');valid=false;return{extension:'jpg',mime:'image/jpeg',width:1200,height:900};});
 await expect(createAlbumEpubPreview('book',()=>valid)).rejects.toThrow('CANCELLED');expect([...mockFiles.entries()]).toEqual([['file:///original.jpg','source'],['file:///documents/album.epub','saved']]);expect(FS.deleteAsync).toHaveBeenCalledWith(expect.stringContaining('/album-epub-preview/preview_'),{idempotent:true});
});
it('rejects a stale source rather than presenting a mixed preview',async()=>{
 mockRead.mockResolvedValueOnce({input}).mockResolvedValueOnce({input:{...input,album:{...input.album,name:'Changed'}}});
 await expect(createAlbumEpubPreview('book',()=>true)).rejects.toThrow('SOURCE_CHANGED');expect(mockFiles.size).toBe(0);
});
