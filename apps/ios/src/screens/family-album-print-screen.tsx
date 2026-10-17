import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { printFailureDiagnostic } from '../application/album-print';
import { familyPaperScope, familyPdfEnabled } from '../application/family-album-paper';
import { createExpoFamilyAlbumPrint, familyPaperReader } from '../infrastructure/family-album-paper';
import { familyPaperStyle } from '../infrastructure/family-paper-style';
import { listSavedAlbumPrints, shareSavedAlbumPrint, summarizePrint, type SavedPrintSummary } from '../infrastructure/album-print-files';
import { useFamilyPaper } from './use-family-paper';
import { FamilyPurchasePanel } from './family-purchase-panel';
import { SettingsPage } from './settings-chrome';
import { firstSearchParam } from './lookback-origin';
import { Text, type } from './life-text';
import { sage, inkSoft } from './life-page';
import { tr } from '../i18n';
export default function FamilyAlbumPrintScreen(){
  const params=useLocalSearchParams<{familyId?:string;albumId?:string}>();const familyId=firstSearchParam(params.familyId)??'',albumId=firstSearchParam(params.albumId)??'';
  const router=useRouter(),reading=useFamilyPaper(familyId,albumId,false);
  const [savedState,setSaved]=useState<{scope:string;files:SavedPrintSummary[]}>({scope:'',files:[]}),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
  const [accessRequired,setAccessRequired]=useState(false),[diagnostic,setDiagnostic]=useState('');
  const owner=useRef(false),generation=useRef(0),mounted=useRef(false);
  const invalidateJobs=useCallback(()=>{generation.current++;},[]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;invalidateJobs();};},[invalidateJobs]);
  const {view,capture}=reading;
  const scope=view?familyPaperScope(view):'';
  const saved=savedState.scope===scope?savedState.files:[];
  useEffect(()=>{
    let current=true;const book=view;const lease=capture();
    if(scope&&book)void(async()=>{
      try{const files=await listSavedAlbumPrints(scope);const reader=await familyPaperReader();await reader.albums.validate(book,()=>current&&lease());if(current&&lease())setSaved({scope,files});}catch{if(current)setFailed(true);}
    })();
    return()=>{current=false;invalidateJobs();};
  },[scope,view,capture,invalidateJobs]);
  async function run(work:(valid:()=>boolean)=>Promise<void>){
    if(owner.current||!reading.view||!reading.valid()||!familyPdfEnabled())return;
    owner.current=true;setBusy(true);setFailed(false);setAccessRequired(false);setDiagnostic('');const ticket=++generation.current;
    const lease=capture();
    const valid=()=>ticket===generation.current&&lease()&&familyPdfEnabled();
    try{
      const reader=await familyPaperReader();await reader.albums.validate(reading.view,valid);
      await work(valid);
    }catch(error){if(valid()){const info=printFailureDiagnostic(error);if(info.code==='PURCHASE_REQUIRED')setAccessRequired(true);else setFailed(true);setDiagnostic(`${info.stage}/${info.code}`);}}
    finally{owner.current=false;if(mounted.current)setBusy(false);}
  }
  const hit={minHeight:48,justifyContent:'center' as const};
  return <SettingsPage title={tr('导出这一册')} backLabel={tr('这一册')} accessibilityLabel={tr('导出这一册')} onBack={()=>router.back()} pageTestID="family-album-print">
    {!familyPdfEnabled()?<Text>{tr('家庭文件导出尚未开放。')}</Text>:null}
    {reading.error?<><Text>{tr('家庭内容或资格已变化，请重新核对。')}</Text><Pressable accessibilityRole="button" style={hit} onPress={reading.retry}><Text>{tr('再试一次')}</Text></Pressable></>:null}
    {familyPdfEnabled()&&!reading.blocked&&reading.view?<View style={{gap:16}}>
      <Text style={type.body}>{reading.view.name}</Text>
      <Text style={{...type.meta,color:inkSoft}}>{tr('PDF不含声音，电子册文件将在后续阶段提供。')}</Text>
      {reading.view.access.canManage?<>
        <FamilyPurchasePanel familyId={familyId}/>
        <Pressable accessibilityRole="button" disabled={busy} style={hit} onPress={()=>void run(async valid=>{
          const book=reading.view!;
          const service=await createExpoFamilyAlbumPrint(familyId,albumId,valid,book);
          const result=await service.save(familyPaperStyle(scope));
          if(valid())setSaved(old=>({scope,files:[summarizePrint(result.manifest),...(old.scope===scope?old.files:[])]}));
        })}><Text style={{...type.action,color:sage}}>{tr('生成PDF')}</Text></Pressable>
      </>:null}
      {accessRequired?<Text accessibilityLiveRegion="polite">{tr('请先解锁或恢复导出权益，再点生成PDF。')}</Text>:null}
      {__DEV__&&diagnostic?<Text selectable>{diagnostic}</Text>:null}
      {failed?<Text accessibilityLiveRegion="polite">{tr('本次没有生成。请核对记录、媒体和原生构建后再试。')}</Text>:null}
      {saved.length===0?<Text>{tr('还没有生成PDF。')}</Text>:null}
      {saved.map(file=><Pressable key={file.id} accessibilityRole="button" disabled={busy} style={hit} onPress={()=>void run(async valid=>{await shareSavedAlbumPrint(file,valid);})}><Text style={{...type.action,color:sage}}>{tr('保存PDF')} · {file.createdAt}</Text></Pressable>)}
    </View>:null}
  </SettingsPage>;
}
