import { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { familyPaperScope } from '../application/family-album-paper';
import { familyReadingState, setFamilyReadingState } from '../infrastructure/family-paper-style';
import type { AlbumReadingPosition, AlbumReadingStyle } from '../application/album-reading';
import { firstSearchParam } from './lookback-origin';
import LifeAlbumReadingScreen from './life-album-reading-screen';
import { useFamilyPaper } from './use-family-paper';
export default function FamilyAlbumReadingScreen(){
  const params=useLocalSearchParams<{familyId?:string;albumId?:string}>(),router=useRouter();
  const familyId=firstSearchParam(params.familyId)??'',albumId=firstSearchParam(params.albumId)??'';
  const reading=useFamilyPaper(familyId,albumId,true);
  const scope=reading.view?familyPaperScope(reading.view):'';
  const persist=useCallback((style:AlbumReadingStyle,position:AlbumReadingPosition|null)=>setFamilyReadingState(scope,style,position),[scope]);
  return <LifeAlbumReadingScreen key={scope} family={{albumId:scope,input:reading.prepared?.input??null,blocked:reading.blocked,error:reading.error,
    preference:familyReadingState(scope),onPersist:persist,current:reading.valid,retry:reading.retry,
    onPaper:()=>router.push({pathname:'/family-album-paper',params:{familyId,albumId}})}}/>;
}
