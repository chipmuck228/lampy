import {useCallback,useEffect,useState} from 'react';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {firstSearchParam} from './lookback-origin';
import {useFamilyPaper} from './use-family-paper';
import {EpubPreviewReader,epubPreviewAvailable} from './album-epub-preview-screen';
import type {EpubPreview} from '../infrastructure/album-epub-preview';
import {createFamilyEpubPreview} from '../infrastructure/family-epub-preview';
export default function FamilyEpubPreviewScreen(){
 const params=useLocalSearchParams<{familyId?:string;albumId?:string}>(),router=useRouter();
 const reading=useFamilyPaper(firstSearchParam(params.familyId)??'',firstSearchParam(params.albumId)??'',false);
 const {view,capture}=reading;
 const [focused,setFocused]=useState(false);
 useFocusEffect(useCallback(()=>{setFocused(true);return()=>setFocused(false);},[]));
 const [book,setBook]=useState<{source:typeof view;value:EpubPreview}|null>(null),[page,setPage]=useState(0),[fraction,setFraction]=useState(0),[failed,setFailed]=useState(false),[loading,setLoading]=useState(true);
 useEffect(()=>{
  // Immediately invalidate the prior lease before rebuilding its external reader cache.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setBook(null);setPage(0);setFraction(0);setFailed(false);setLoading(true);
  let active=true,owned:EpubPreview|null=null;const lease=capture(),current=()=>active&&lease();
  if(view&&epubPreviewAvailable)void createFamilyEpubPreview(view,current,n=>{if(current())setFraction(n);}).then(async result=>{if(!current()){await result.dispose();return;}owned=result;setBook({source:view,value:result});}).catch(()=>{if(current())setFailed(true);});
  return()=>{active=false;if(owned)void owned.dispose().catch(()=>undefined);};
 },[view,capture]);
 const shown=view&&reading.valid()&&book?.source===view?book.value:null;
 const turn=(step:number)=>{const next=Math.max(0,Math.min((shown?.pages.length??1)-1,page+step));if(next!==page){setPage(next);setLoading(true);setFailed(false);}};
 return <EpubPreviewReader book={shown} page={page} blocked={reading.blocked} focused={focused} failed={reading.error||failed} fraction={fraction} loading={loading} onClose={()=>router.back()} onRetry={reading.retry} onTurn={turn} onReady={()=>setLoading(false)} onFailure={()=>setFailed(true)}/>;
}
