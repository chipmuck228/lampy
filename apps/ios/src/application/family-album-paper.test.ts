import { prepareFamilyPaper, createFamilyAlbumPrint, familyPaperScope, familyPdfEnabled, type FamilyPaperReader } from './family-album-paper';
import type { FamilyAlbumView } from '../family-api/family-album-types';
import { createGlyphWidthMeasurer } from './album-text-measure';
import { paginateAlbumLayout } from './album-paginate';
import type { PrintStore } from './album-print';
import type { AlbumFontDiagnosis } from '../../modules/lampy-album-layout';
function fixture(withMedia=false){
 const view={familyId:'f',albumId:'book',name:'家里的日子',opening:'开篇',createdAt:'2026-10-01',updatedAt:'2026-10-17',revision:1,validation:'validated',
  access:{userId:'a',membershipId:'m',familyId:'f',role:'creator',authority:'authority',canManage:true,canExport:true,rulesAcknowledged:true,rulesVersion:1},
  cover:withMedia?{shareId:'s',objectId:'photo'}:null,
  items:[{shareId:'s',status:'active',share:{shareId:'s',familyId:'f',authorNickname:'爸爸🙂',sourceRevision:2,snapshot:{note:'原文\n🦞💩',emotion:'平静',occurredAtPrecision:'unknown',media:withMedia?[{objectId:'photo',mimeType:'image/png'}]:[]}}}]} as FamilyAlbumView;
 const validate=jest.fn(async()=>({valid:true as const})),authorizeExport=jest.fn(async()=>({allowed:true as const,userId:'a'}));
 const reader:FamilyPaperReader={albums:{read:jest.fn(async()=>view),validate,authorizeExport},
  readMedia:jest.fn(async()=>({userId:'a',share:view.items[0].status==='active'?view.items[0].share:null!,media:[{objectId:'photo',mimeType:'image/png',uri:'file://private/photo.png'}]})),
  imageSize:jest.fn(async()=>({width:400,height:800}))};
 const store:PrintStore={begin:jest.fn(async()=>{}),copy:jest.fn(async(_id,assetId)=>({assetId,file:'media-0',uri:'/staging/photo',sha256:'photo-hash',bytes:10})),verifySource:jest.fn(async()=>{}),
  writePdf:jest.fn(async(_id,layout)=>({pageCount:layout.pages.length,bytes:100,widthPt:layout.pageSize.widthPt,heightPt:layout.pageSize.heightPt,fontsEmbedded:null,fontResources:[],textSelectable:true,fontRunNames:['serif'],sha256:'pdf-hash'})),
  writeManifest:jest.fn(async()=>{}),commit:jest.fn(async()=>({pdfUri:'file://finished.pdf'})),discard:jest.fn(async()=>{})};
 const service=(initialView?:FamilyAlbumView)=>createFamilyAlbumPrint({...reader,store,initialView,enabled:true,familyId:'f',albumId:'book',current:()=>true,id:()=> 'print_family',now:()=> '2026-10-17',
  fonts:()=>({serif:{fontName:'serif'},ui:{fontName:'ui'}} as AlbumFontDiagnosis),layout:input=>paginateAlbumLayout(input,createGlyphWidthMeasurer(),{generatedAt:'2026-10-17',timezone:{timeZone:'UTC'}})});
 return {view,reader,store,validate,authorizeExport,service};
}
it('adapts only family snapshots, preserves original text, cover, image ratio and attribution',async()=>{
 const f=fixture(true);const result=await prepareFamilyPaper(f.view,f.reader,()=>true);
 expect(result.input.entries[0]).toMatchObject({note:'原文\n🦞💩',attribution:'爸爸🙂',revision:2,media:[{intrinsicRatio:0.5,widthPx:400,heightPx:800}]});
 expect(result.input.album.cover).toMatchObject({kind:'image',momentId:'s'});
 expect(result.input.album.id).toBe(familyPaperScope(f.view));expect(f.validate).toHaveBeenCalledTimes(2);
 expect(familyPaperScope({...f.view,access:{...f.view.access,userId:'b'}})).not.toBe(result.input.album.id);
});
it('does not invent removed records and never reveals media from a different account',async()=>{
 const f=fixture(true);f.view.items=[{shareId:'gone',status:'withdrawn'}];
 const result=await prepareFamilyPaper(f.view,f.reader,()=>true);expect(result.input.entries[0].presence).toBe('missing');expect(f.reader.readMedia).not.toHaveBeenCalled();
 const other=fixture(true);(other.reader.readMedia as jest.Mock).mockResolvedValue({userId:'b',share:{shareId:'s',familyId:'f'},media:[]});
 await expect(prepareFamilyPaper(other.view,other.reader,()=>true)).rejects.toMatchObject({code:'FAMILY_ALBUM_CANCELLED'});
 await expect(other.service({...other.view,familyId:'other'}).save('plain')).rejects.toMatchObject({code:'FAMILY_ALBUM_CANCELLED'});
 expect(other.authorizeExport).not.toHaveBeenCalled();
});
it('rejects downloads completed after withdrawal or page exit',async()=>{
 const f=fixture(true);f.validate.mockResolvedValueOnce({valid:true}).mockRejectedValueOnce(Error('FAMILY_ALBUM_CHANGED'));
 await expect(prepareFamilyPaper(f.view,f.reader,()=>true)).rejects.toThrow('FAMILY_ALBUM_CHANGED');
 await expect(prepareFamilyPaper(f.view,f.reader,()=>false)).rejects.toMatchObject({code:'FAMILY_ALBUM_CANCELLED'});
});
it('exports a frozen family edition and rechecks the server grant before source, before commit and before delivery',async()=>{
 const f=fixture();const result=await f.service().save('handmade');
 expect(result.manifest.albumId).toBe(familyPaperScope(f.view));expect(result.manifest.content.entries[0].note).toBe('原文\n🦞💩');
 expect(f.authorizeExport).toHaveBeenCalledTimes(3);expect(f.store.commit).toHaveBeenCalledTimes(1);
 expect(result.manifest.layout.pages.flatMap(p=>p.blocks).some(b=>b.kind==='recorded-at'&&b.label==='爸爸🙂')).toBe(true);
});
it('cannot bypass purchase with a client boolean and cleans a completed file after final revocation',async()=>{
 const f=fixture();f.authorizeExport.mockRejectedValueOnce(Error('PURCHASE_REQUIRED'));
 await expect(f.service().save('plain')).rejects.toThrow('PURCHASE_REQUIRED');expect(f.store.begin).not.toHaveBeenCalled();expect(f.reader.readMedia).not.toHaveBeenCalled();
 f.authorizeExport.mockResolvedValueOnce({allowed:true,userId:'a'}).mockResolvedValueOnce({allowed:true,userId:'a'}).mockRejectedValueOnce(Error('PURCHASE_REQUIRED'));
 await expect(f.service().save('plain')).rejects.toThrow('PURCHASE_REQUIRED');expect(f.store.commit).toHaveBeenCalled();expect(f.store.discard).toHaveBeenCalledWith('print_family');
});
it('keeps family export default off and requires the unified paid switches',()=>{
 const keys=['EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED','EXPO_PUBLIC_UNIFIED_PURCHASES','EXPO_PUBLIC_ALBUM_EXPORT_ENABLED','EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED'];
 const old=keys.map(k=>process.env[k]);
 try{keys.forEach(k=>delete process.env[k]);expect(familyPdfEnabled()).toBe(false);keys.forEach(k=>process.env[k]='1');expect(familyPdfEnabled()).toBe(true);process.env.EXPO_PUBLIC_UNIFIED_PURCHASES='0';expect(familyPdfEnabled()).toBe(false);}
 finally{keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});
