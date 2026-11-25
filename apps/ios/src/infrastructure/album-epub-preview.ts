import * as FS from 'expo-file-system/legacy';
import {File,FileMode} from 'expo-file-system';
import {strFromU8} from 'fflate';
import {albumEpubNative} from '../../modules/lampy-album-layout';
import {getUseCases} from '../application/container';
import {albumEpubDocuments,type EpubResource} from '../application/album-epub';
import {albumReadingFingerprint} from '../application/album-reading';
import {dateKeyAndLabel} from '../application/album-paginate';
import {appLanguage,dateLabel} from '../i18n';
import {epubAudioFormat} from '../application/epub-audio-format';
export type EpubPreview={name:string;rootUri:string;pages:{name:string;uri:string}[];dispose():Promise<void>};
/** Free, private reader cache. Never creates a saved edition or invokes purchases/share. */
export async function createAlbumEpubPreview(albumId:string,current:()=>boolean,progress?:(fraction:number)=>void):Promise<EpubPreview>{
 if(!FS.cacheDirectory)throw Error('PREVIEW_UNAVAILABLE');
 const root=`${FS.cacheDirectory}album-epub-preview/preview_${Date.now()}_${Math.random().toString(36).slice(2)}/`;
 const check=()=>{if(!current())throw Error('CANCELLED');};
 const report=(n:number)=>{if(current())try{progress?.(n);}catch{/* Presentation must not affect reading. */}};
 const dispose=()=>FS.deleteAsync(root,{idempotent:true});
 try{
  check();const app=await getUseCases();check();
  const original=(await app.readAlbumForContinuousReading(albumId,{privateUnlocked:current()})).input;check();
  const fingerprint=albumReadingFingerprint(original);
  const input=JSON.parse(JSON.stringify(original)) as typeof original;
  await FS.makeDirectoryAsync(root+'OEBPS/media/',{intermediates:true});check();
  await FS.makeDirectoryAsync(root+'META-INF/',{intermediates:true});check();
  const assets:Record<string,EpubResource>={};
  const unique=new Map(input.entries.flatMap(e=>e.media).map(m=>[m.assetId,m]));let done=0;
  for(const item of unique.values()){
   check();if(item.availability!=='available'||!item.uri)throw Error('MISSING_CONTENT');
   if(await FS.getFreeDiskStorageAsync()<32*1024*1024)throw Error('EPUB_DISK_FULL');check();
   let path:string,mime:string;
   if(item.role==='image'){
    const temporary=root+`OEBPS/media/asset-${done}.image`;
    const prepared=await albumEpubNative().prepareImage(item.uri,temporary);check();
    path=`media/asset-${done}.${prepared.extension}`;mime=prepared.mime;
    await FS.moveAsync({from:temporary,to:root+'OEBPS/'+path});check();
    for(const entry of input.entries)for(const media of entry.media)if(media.assetId===item.assetId){media.widthPx=prepared.width;media.heightPx=prepared.height;media.intrinsicRatio=prepared.width/prepared.height;}
   }else if(item.role==='audio'){
    const reader=new File(item.uri).open(FileMode.ReadOnly);let header:Uint8Array;
    try{header=reader.readBytes(16);}finally{reader.close();}
    const format=epubAudioFormat(header);path=`media/asset-${done}.${format.extension}`;mime=format.mime;
    await FS.copyAsync({from:item.uri,to:root+'OEBPS/'+path});check();
   }else throw Error('EPUB_UNSUPPORTED_MEDIA');
   assets[item.assetId]={path,mime};report(.1+.7*++done/Math.max(1,unique.size));
  }
  const dates:Record<string,{label:string;chapter:string}>={};
  const clock={timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'};
  for(const entry of input.entries){const d=dateKeyAndLabel(entry,clock),m=d.key&&/^([dmy]):(\d{4})(?:-(\d{1,2}))?/.exec(d.key);if(d.label&&m)dates[entry.momentId]={label:d.label,chapter:m[3]?dateLabel(Number(m[2]),Number(m[3])):m[2]};}
  const docs=albumEpubDocuments({input,assets,dates,id:'preview',createdAt:new Date().toISOString(),design:'imagebook',language:appLanguage});
  for(const [name,bytes] of Object.entries(docs)){check();await FS.writeAsStringAsync(root+name,strFromU8(bytes));}
  const latest=(await app.readAlbumForContinuousReading(albumId,{privateUnlocked:current()})).input;check();
  if(albumReadingFingerprint(latest)!==fingerprint)throw Error('SOURCE_CHANGED');
  const order=[...strFromU8(docs['OEBPS/package.opf']).matchAll(/<itemref idref="([^"]+)"[^>]*\/>/g)].filter(m=>!m[0].includes('linear="no"')).map(m=>m[1]);
  if(!order.length||order.at(-1)!=='archive')throw Error('PREVIEW_UNAVAILABLE');
  report(1);return{name:input.album.name,rootUri:root,pages:order.map(name=>({name,uri:root+'OEBPS/'+name+'.xhtml'})),dispose};
 }catch(error){await dispose().catch(()=>undefined);throw error;}
}
