import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ALBUM_SERIF_FONT, ALBUM_UI_FONT, type AlbumLayout } from '../application/album-layout';
import { familyPaperScope } from '../application/family-album-paper';
import { diagnoseAlbumFonts } from '../../modules/lampy-album-layout';
import { layoutAlbumPrint } from '../infrastructure/album-print-files';
import { familyPaperStyle } from '../infrastructure/family-paper-style';
import { firstSearchParam } from './lookback-origin';
import LifeAlbumPreviewScreen from './life-album-preview-screen';
import { useFamilyPaper } from './use-family-paper';
import { tr } from '../i18n';
export default function FamilyAlbumPaperScreen(){
  const params=useLocalSearchParams<{familyId?:string;albumId?:string}>();
  const reading=useFamilyPaper(firstSearchParam(params.familyId)??'',firstSearchParam(params.albumId)??'',true);
  const [layout,setLayout]=useState<{input:object;result:AlbumLayout}|null>(null);
  const [failure,setFailure]=useState<object|null>(null);
  const {prepared,capture}=reading;
  const scope=reading.view?familyPaperScope(reading.view):'';
  const style=familyPaperStyle(scope);
  useEffect(()=>{
    let cancelled=false;const valid=capture();
    if(prepared)void(async()=>{
      try{
        const fonts=diagnoseAlbumFonts(ALBUM_SERIF_FONT,ALBUM_UI_FONT);if(!fonts)throw Error('native rebuild required');
        const result=await layoutAlbumPrint(prepared.input,style,fonts);
        if(!cancelled&&valid())setLayout({input:prepared.input,result});
      }catch{if(!cancelled)setFailure(prepared.input);}
    })();
    return()=>{cancelled=true;};
  },[prepared,capture,style]);
  const failed=reading.error||(!!prepared&&prepared.input===failure);
  const shown=reading.view&&layout?.input===prepared?.input?layout?.result??null:null;
  return <LifeAlbumPreviewScreen key={scope} family={{albumId:scope,layout:shown,media:prepared?.media??{},style,
    blocked:reading.blocked,loading:!failed&&!shown,error:failed?tr('家庭内容或资格已变化，请重新核对。'):null,
    retry:reading.retry,current:reading.valid}}/>;
}
