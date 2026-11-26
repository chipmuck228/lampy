import {albumNoteExcerpt,type AlbumEntryView} from '../application/life-album';
import type {FamilyAlbumItem,FamilyAlbumView} from '../family-api/family-album-types';
import {tr} from '../i18n';
import {AlbumContentsPreview} from './album-contents-preview';
import {FamilyAlbumCoverPreview} from './family-album-editor';
import {familySnapshotDate} from './family-history-copy';

/** A transient display adapter; never stores or reorders family source records. */
export function familyAlbumContentsEntries(items:FamilyAlbumItem[]):AlbumEntryView[]{
 return items.map(item=>{
  const active=item.status==='active',snapshot=active?item.share.snapshot:null;
  const images=snapshot?.media.filter(media=>media.mimeType.startsWith('image/'))??[];
  const audio=snapshot?.media.filter(media=>media.mimeType.startsWith('audio/'))??[];
  return {momentId:item.shareId,collectedAt:'',sourceRevisionAtCollect:0,source:active?'ready':'missing',
   noteExcerpt:albumNoteExcerpt(snapshot?.note),dateLabel:snapshot?.occurredAt&&snapshot.occurredAtPrecision!=='unknown'?familySnapshotDate(snapshot):null,
   mediaHint:null,photoCount:images.length,hasAudio:audio.length>0,unknownCount:snapshot?.media.filter(media=>!media.mimeType.startsWith('image/')&&!media.mimeType.startsWith('audio/')).length??0,
   audioDurationMs:null,thumbnailUri:null,occurredSortKey:snapshot?.occurredAt&&snapshot.occurredAtPrecision!=='unknown'&&Number.isFinite(Date.parse(snapshot.occurredAt))?Date.parse(snapshot.occurredAt):null};
 });
}
export function FamilyAlbumContents({book,disabled,onOpen}:{book:FamilyAlbumView;disabled:boolean;onOpen:(shareId:string)=>void}){
 return <AlbumContentsPreview prefix="family-album" entries={familyAlbumContentsEntries(book.items)} disabled={disabled} disableMissing
   missingLabel={tr('这条分享已不可用。')} onOpen={entry=>onOpen(entry.momentId)}
   attribution={entry=>{const item=book.items.find(item=>item.shareId===entry.momentId);return item?.status==='active'?item.share.authorNickname||tr('家人'):undefined;}}
   renderPhoto={entry=>{const item=book.items.find(item=>item.shareId===entry.momentId);const media=item?.status==='active'?item.share.snapshot.media.find(media=>media.mimeType.startsWith('image/')):null;
    return media?<FamilyAlbumCoverPreview familyId={book.familyId} cover={{shareId:entry.momentId,objectId:media.objectId}} fill/>:null;}}/>;
}
