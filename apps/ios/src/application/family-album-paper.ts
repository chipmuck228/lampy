import type { FamilyAlbumView } from '../family-api/family-album-types';
import type { FamilyAlbumUseCases } from './family-album';
import type { HistoryReading } from './family-history-use-cases';
import type { AlbumLayoutInput, AlbumLayoutMediaMap, AlbumLayoutRecordInput } from './album-layout-input';
import { createAlbumPrintService } from './album-print';
import { ApplicationError } from './errors';
import { tr } from '../i18n';

export const familyPaperScope = (view: FamilyAlbumView) => `family:${JSON.stringify([view.access.userId,view.familyId,view.albumId])}`;
export function familyPdfEnabled() {
  return process.env.EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED==='1' && process.env.EXPO_PUBLIC_UNIFIED_PURCHASES==='1' &&
    process.env.EXPO_PUBLIC_ALBUM_EXPORT_ENABLED==='1' && process.env.EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED==='1';
}
export type FamilyPaperReader = {
  albums: Pick<FamilyAlbumUseCases,'read'|'validate'|'authorizeExport'>;
  readMedia(familyId:string,shareId:string,current:()=>boolean):Promise<HistoryReading>;
  imageSize(uri:string):Promise<{width:number;height:number}>;
};
function active(current:()=>boolean) { if(!current())throw new ApplicationError('FAMILY_ALBUM_CANCELLED','Family preview is inactive.'); }
/** Adapt authorized family snapshots only. Never creates moments, assets or personal albums. */
export async function prepareFamilyPaper(view:FamilyAlbumView,deps:FamilyPaperReader,current:()=>boolean) {
  active(current);
  await deps.albums.validate(view,current);
  const entries:AlbumLayoutRecordInput[]=[];const media:AlbumLayoutMediaMap={};
  for(const item of view.items) {
    active(current);
    const base={momentId:item.shareId,collectedAt:view.createdAt,sourceRevisionAtCollect:1,revision:1,recordedAt:'',occurredAtPrecision:'unknown',note:'',feeling:'',media:[]};
    if(item.status==='withdrawn'){entries.push({...base,presence:'missing'});continue;}
    const share=item.share;
    const read=share.snapshot.media.length?await deps.readMedia(view.familyId,item.shareId,current):null;
    active(current);
    if(read&&(read.userId!==view.access.userId || read.share.shareId!==item.shareId || read.share.familyId!==view.familyId))throw new ApplicationError('FAMILY_ALBUM_CANCELLED','Account changed.');
    const assets:AlbumLayoutRecordInput['media']=[];
    for(const source of share.snapshot.media) {
      const local=read?.media.find(m=>m.objectId===source.objectId&&m.mimeType===source.mimeType);
      if(!local?.uri)throw new ApplicationError('SHARE_MEDIA_UNAVAILABLE','Family media is unavailable.');
      const assetId=JSON.stringify([view.access.userId,view.familyId,item.shareId,source.objectId]);
      const role=source.mimeType.startsWith('image/')?'image':source.mimeType.startsWith('audio/')?'audio':'unknown';
      const size=role==='image'?await deps.imageSize(local.uri):null;
      active(current);
      if(size&&(!Number.isFinite(size.width)||!Number.isFinite(size.height)||size.width<=0||size.height<=0))throw new ApplicationError('SHARE_MEDIA_UNAVAILABLE','Invalid image size.');
      assets.push({assetId,role,availability:'available',uri:local.uri,durationMs:null,intrinsicRatio:size?size.width/size.height:null,...(size?{widthPx:size.width,heightPx:size.height}:{})});
      media[assetId]=local.uri;
    }
    entries.push({...base,sourceRevisionAtCollect:share.sourceRevision,revision:share.sourceRevision,presence:'ready',
      note:share.snapshot.note,attribution:share.authorNickname||tr('家人'),feeling:share.snapshot.emotion,
      occurredAt:share.snapshot.occurredAt,occurredAtPrecision:share.snapshot.occurredAtPrecision,media:assets});
  }
  // Recheck after downloads: a withdrawn share must never be revealed by late work.
  await deps.albums.validate(view,current);active(current);
  const input:AlbumLayoutInput={album:{id:familyPaperScope(view),schemaVersion:1,name:view.name,opening:view.opening,
    cover:view.cover?{kind:'image',momentId:view.cover.shareId,assetId:JSON.stringify([view.access.userId,view.familyId,view.cover.shareId,view.cover.objectId])}:{kind:'words'},
    entries:entries.map(e=>({momentId:e.momentId,collectedAt:e.collectedAt,sourceRevisionAtCollect:e.sourceRevisionAtCollect})),createdAt:view.createdAt,updatedAt:view.updatedAt},entries};
  return {view,input,media};
}

type PrintDependencies = Parameters<typeof createAlbumPrintService>[0];
export function createFamilyAlbumPrint(deps:FamilyPaperReader & Omit<PrintDependencies,'read'|'authorize'|'afterCommit'> & {familyId:string;albumId:string;enabled:boolean;initialView?:FamilyAlbumView}) {
  let view:FamilyAlbumView|null=deps.initialView??null;
  let prepared:Awaited<ReturnType<typeof prepareFamilyPaper>>|null=null;
  async function authorize() {
    active(deps.current);
    if(!deps.enabled)throw new ApplicationError('FAMILY_ALBUM_EXPORT_CLOSED','Family PDF export is closed.');
    view??=await deps.albums.read(deps.familyId,deps.albumId,deps.current);
    if(view.familyId!==deps.familyId||view.albumId!==deps.albumId)throw new ApplicationError('FAMILY_ALBUM_CANCELLED','Family album changed.');
    await deps.albums.authorizeExport(view,deps.current);active(deps.current);
  }
  return createAlbumPrintService({...deps,authorize,afterCommit:authorize,
    async read(){
      if(!view)throw new ApplicationError('FAMILY_ALBUM_CANCELLED','Missing export authorization.');
      if(!prepared)prepared=await prepareFamilyPaper(view,deps,deps.current);
      else await deps.albums.validate(view,deps.current);
      active(deps.current);return prepared.input;
    },
  });
}
