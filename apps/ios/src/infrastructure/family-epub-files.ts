import * as FS from 'expo-file-system/legacy';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {strToU8} from 'fflate';
import type {FamilyAlbumView} from '../family-api/family-album-types';
import {familyPaperScope} from '../application/family-album-paper';
import {familyEpubEnabled,familyEpubStamp,assertFamilyEpubScope,prepareFamilyEpub,type FamilyEpubSnapshot} from '../application/family-epub';
import {freezeEpubSnapshot,type EpubSnapshot} from '../application/album-epub-snapshot';
import {manifestDigest} from '../application/album-print';
import {dateKeyAndLabel} from '../application/album-paginate';
import {dateLabel} from '../i18n';
import {albumPrintNative} from '../../modules/lampy-album-layout';
import {familyPaperReader} from './family-album-paper';
import {shareAlbumEpub,type EpubProgress} from './album-epub-files';
import {acquireAlbumEdition} from './album-edition-lock';
const active=new Set<string>();
function check(current:()=>boolean){if(!current())throw Error('CANCELLED');}
function directory(view:FamilyAlbumView,id=''){
 if(!FS.documentDirectory||id&&!/^epub_[a-zA-Z0-9_-]{1,94}$/.test(id))throw Error('EPUB_INVALID_EDITION');
 const scope=bytesToHex(sha256(strToU8(familyPaperScope(view))));
 return `${FS.documentDirectory}family-epub-editions/${scope}/${id?id+'/':''}`;
}
async function readManifest(view:FamilyAlbumView,id:string){
 const dir=directory(view,id),snapshot:FamilyEpubSnapshot=JSON.parse(await FS.readAsStringAsync(dir+'manifest.json'));
 if(snapshot.id!==id||manifestDigest(snapshot)!==await FS.readAsStringAsync(dir+'manifest.sha256'))throw Error('PRINT_FILE_CHANGED');
 assertFamilyEpubScope(snapshot,view,false);return snapshot;
}
async function complete(dir:string){return(await Promise.all(['en','zh-Hans'].map(async lang=>(await FS.getInfoAsync(dir+`album-${lang}.epub`)).exists&&(await FS.getInfoAsync(dir+`album-${lang}.epub.sha256`)).exists))).some(Boolean);}
export type SavedFamilyEpub={id:string;name:string;createdAt:string;stale:boolean};
export async function listFamilyEpubs(view:FamilyAlbumView,current:()=>boolean):Promise<SavedFamilyEpub[]>{
 check(current);const reader=await familyPaperReader();await reader.albums.validate(view,current);check(current);
 const root=directory(view);await FS.makeDirectoryAsync(root,{intermediates:true});const saved:SavedFamilyEpub[]=[];
 for(const id of await FS.readDirectoryAsync(root)){
  check(current);if(!/^epub_[a-zA-Z0-9_-]{1,94}$/.test(id)||active.has(id))continue;
  try{const snapshot=await readManifest(view,id);if(await complete(directory(view,id)))saved.push({id,name:snapshot.name,createdAt:snapshot.createdAt,stale:snapshot.family.validation!==view.validation});}catch{/* Corrupt files are never represented as a valid edition. */}
 }
 await reader.albums.validate(view,current);check(current);return saved.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function shareFamilyEpub(view:FamilyAlbumView,current:()=>boolean,progress?:(p:EpubProgress)=>void,existingId?:string,onSaved?:(id:string)=>void){
 if(!familyEpubEnabled())throw Error('FAMILY_ALBUM_EXPORT_CLOSED');
 check(current);const reader=await familyPaperReader();
 const authorizeFamily=async()=>{check(current);if(!familyEpubEnabled())throw Error('FAMILY_ALBUM_EXPORT_CLOSED');await reader.albums.authorizeExport(view,current);check(current);};
 progress?.({stage:'AUTHORIZE',done:0,total:1});await authorizeFamily();
 const id=existingId??`epub_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
 const dir=directory(view,id),building=directory(view)+'.building-'+id+'/';
 if(active.has(id))throw Error('EPUB_BUSY');active.add(id);let committed=false;
 try{
  if(!existingId){
   let prepared:Awaited<ReturnType<typeof prepareFamilyEpub>>|null=null;
   await freezeEpubSnapshot({id,now:new Date().toISOString(),design:'imagebook',current,authorize:authorizeFamily,progress:(done,total)=>progress?.({stage:'READ_MEDIA',done,total}),
    read:async()=>{if(!prepared)prepared=await prepareFamilyEpub(view,reader,current);else await reader.albums.validate(view,current);return prepared.input;},
    dates(input){const dates:EpubSnapshot['dates']={},clock={timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'};for(const e of input.entries){const d=dateKeyAndLabel(e,clock),m=d.key&&/^([dmy]):(\d{4})(?:-(\d{1,2}))?/.exec(d.key);if(d.label&&m)dates[e.momentId]={label:d.label,chapter:m[3]?dateLabel(Number(m[2]),Number(m[3])):m[2]};}return dates;},
    store:{
     async begin(){await FS.makeDirectoryAsync(building,{intermediates:true});},
     async copy(_id,source,index){if(await FS.getFreeDiskStorageAsync()<64*1024*1024)throw Error('EPUB_DISK_FULL');const file=`media-${index}`;return{file,...await albumPrintNative().copyPrintMedia(source,building+file)};},
     async verify(source,hash){if((await albumPrintNative().printFileDigest(source)).sha256!==hash)throw Error('SOURCE_CHANGED');},
     async commit(snapshot){const manifest:FamilyEpubSnapshot={...snapshot,family:familyEpubStamp(view)};await FS.writeAsStringAsync(building+'manifest.json',JSON.stringify(manifest));await FS.writeAsStringAsync(building+'manifest.sha256',manifestDigest(manifest));await FS.moveAsync({from:building,to:dir});committed=true;},
     async discard(){await FS.deleteAsync(building,{idempotent:true});if(committed)await FS.deleteAsync(dir,{idempotent:true});},
    },
   });
  }
  await readManifest(view,id);check(current);
  await shareAlbumEpub(id,current,p=>{if(p.stage==='SHARE'&&current())onSaved?.(id);progress?.(p);},{directory:()=>dir,async authorize(snapshot){assertFamilyEpubScope(snapshot,view);await authorizeFamily();}});
  return id;
 }finally{
  try{if(!existingId){await FS.deleteAsync(building,{idempotent:true});if(!await complete(dir))await FS.deleteAsync(dir,{idempotent:true});}}catch{/* Keep the original failure; never delete source media or completed editions. */}finally{active.delete(id);}
 }
}
export async function deleteFamilyEpub(view:FamilyAlbumView,id:string,current:()=>boolean){
 check(current);if(active.has(id))throw Error('EPUB_BUSY');const release=acquireAlbumEdition(id);
 try{const reader=await familyPaperReader();await reader.albums.validate(view,current);await readManifest(view,id);check(current);await FS.deleteAsync(directory(view,id),{idempotent:true});}finally{release();}
}
