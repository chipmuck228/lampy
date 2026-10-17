import { Image } from 'react-native';
import { getFamilyUseCases } from '../application/container';
import { createFamilyAlbumPrint, familyPdfEnabled, type FamilyPaperReader } from '../application/family-album-paper';
import { createExpoAlbumPrintStore, layoutAlbumPrint } from './album-print-files';
import { diagnoseAlbumFonts } from '../../modules/lampy-album-layout';
import { ALBUM_SERIF_FONT, ALBUM_UI_FONT } from '../application/album-layout';
export async function familyPaperReader():Promise<FamilyPaperReader> {
  const app=await getFamilyUseCases();
  return {albums:app.albums,readMedia:(familyId,shareId,current)=>app.history.read(familyId,shareId,current),
    imageSize:uri=>new Promise((resolve,reject)=>Image.getSize(uri,(width,height)=>resolve({width,height}),reject))};
}
export async function createExpoFamilyAlbumPrint(familyId:string,albumId:string,valid:()=>boolean,initialView?:import('../family-api/family-album-types').FamilyAlbumView) {
  const reader=await familyPaperReader();
  return createFamilyAlbumPrint({...reader,familyId,albumId,initialView,enabled:familyPdfEnabled(),current:()=>valid()&&familyPdfEnabled(),
    store:createExpoAlbumPrintStore(),fonts:()=>diagnoseAlbumFonts(ALBUM_SERIF_FONT,ALBUM_UI_FONT),layout:layoutAlbumPrint,
    now:()=>new Date().toISOString(),id:()=>`print_${Date.now()}_${Math.random().toString(36).slice(2,10)}`});
}
