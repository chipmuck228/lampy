import {ApplicationError} from './errors';
import type {FamilyAlbumView} from '../family-api/family-album-types';
import type {EpubSnapshot} from './album-epub-snapshot';
import {familyPaperScope,prepareFamilyPaper,type FamilyPaperReader} from './family-album-paper';
import {purchasesSupported} from './mobile-capabilities';
export function familyEpubEnabled(){
 return purchasesSupported()&&process.env.EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED==='1'&&process.env.EXPO_PUBLIC_UNIFIED_PURCHASES==='1'&&process.env.EXPO_PUBLIC_ALBUM_EXPORT_ENABLED==='1'&&process.env.EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED==='1';
}
export type FamilyEpubStamp={version:1;userId:string;familyId:string;albumId:string;validation:string};
export type FamilyEpubSnapshot=EpubSnapshot&{family:FamilyEpubStamp};
export function familyEpubStamp(view:FamilyAlbumView):FamilyEpubStamp{return{version:1,userId:view.access.userId,familyId:view.familyId,albumId:view.albumId,validation:view.validation};}
export function assertFamilyEpubScope(snapshot:unknown,view:FamilyAlbumView,exact=true):asserts snapshot is FamilyEpubSnapshot{
 const s=snapshot as Partial<FamilyEpubSnapshot>|null,f=s?.family;
 if(!s||s.kind!=='epub'||s.design!=='imagebook'||s.version!==1||s.albumId!==familyPaperScope(view)||!f||f.version!==1||f.userId!==view.access.userId||f.familyId!==view.familyId||f.albumId!==view.albumId)throw new ApplicationError('FAMILY_ALBUM_CANCELLED','Family edition scope changed.');
 if(exact&&f.validation!==view.validation)throw new ApplicationError('FAMILY_ALBUM_CHANGED','Family album changed.');
}
/** Existing withdrawn references have no body/media; do not reconstruct them for preview. */
export async function prepareFamilyEpub(view:FamilyAlbumView,reader:FamilyPaperReader,current:()=>boolean){
 const prepared=await prepareFamilyPaper(view,reader,current);
 const entries=prepared.input.entries.filter(e=>e.presence==='ready');
 if(!entries.length)throw new ApplicationError('FAMILY_ALBUM_INCOMPLETE','No current family content.');
 return{...prepared,input:{...prepared.input,entries,album:{...prepared.input.album,entries:prepared.input.album.entries.filter(e=>entries.some(r=>r.momentId===e.momentId))}}};
}
