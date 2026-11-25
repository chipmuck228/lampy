import type {FamilyAlbumView} from '../family-api/family-album-types';
import {prepareFamilyEpub} from '../application/family-epub';
import {familyPaperReader} from './family-album-paper';
import {createEpubPreview} from './album-epub-preview';
export async function createFamilyEpubPreview(view:FamilyAlbumView,current:()=>boolean,progress?:(fraction:number)=>void){
 const reader=await familyPaperReader();let prepared:Awaited<ReturnType<typeof prepareFamilyEpub>>|null=null;
 return createEpubPreview(async()=>{
  if(!prepared)prepared=await prepareFamilyEpub(view,reader,current);
  else await reader.albums.validate(view,current);
  return prepared.input;
 },current,progress);
}
