import {albumExportPageStyles as styles} from './album-export-page-styles';
import {FamilyAlbumCoverPreview} from './family-album-editor';
import {LifeIcon} from './life-icons';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Alert,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {getFamilyUseCases} from '../application/container';
import {familyEpubEnabled} from '../application/family-epub';
import type {FamilyExportEligibility} from '../family-api/purchase-types';
import {listFamilyEpubs,shareFamilyEpub,deleteFamilyEpub,type SavedFamilyEpub} from '../infrastructure/family-epub-files';
import {firstSearchParam} from './lookback-origin';
import {useFamilyPaper} from './use-family-paper';
import {useAlbumExportUnlock} from './album-export-unlock';
import {SettingsPage} from './settings-chrome';
import {ShowcaseButton,ShowcaseNote,ShowcaseUnlocked} from './album-export-showcase';
import {EditionProgress} from './edition-progress';
import {AlbumEditionSwipeRow} from './album-edition-swipe-row';
import {albumEditionDateLabel} from '../application/album-export-showcase';
import {Text,type} from './life-text';
import {inkSoft} from './life-page';
import {tr} from '../i18n';
export default function FamilyEpubScreen(){
 const p=useLocalSearchParams<{familyId?:string;albumId?:string}>(),router=useRouter();
 const familyId=firstSearchParam(p.familyId)??'',albumId=firstSearchParam(p.albumId)??'';
 const reading=useFamilyPaper(familyId,albumId,false),{view,capture}=reading;
 const enabled=familyEpubEnabled(),creator=!!view?.access.canManage;
 const unlock=useAlbumExportUnlock(!reading.blocked&&creator&&enabled);
 const [editions,setEditions]=useState<SavedFamilyEpub[]>([]),[access,setAccess]=useState<FamilyExportEligibility|null>(null),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false),[fraction,setFraction]=useState(0),[message,setMessage]=useState(''),[fresh,setFresh]=useState('');
 const [loadedView,setLoadedView]=useState<typeof view>(null),[accessView,setAccessView]=useState<typeof view>(null);
 const eligible=accessView===view?access:null;
 const owner=useRef(false),cancelled=useRef(false),focus=useRef(false);
 useFocusEffect(useCallback(()=>{focus.current=true;return()=>{focus.current=false;cancelled.current=true;};},[]));
 useEffect(()=>{
  let active=true;const lease=capture(),current=()=>active&&lease();
  if(view)void (async()=>{
   try{const list=await listFamilyEpubs(view,current);if(current()){setLoadedView(view);setEditions(list);}
    if(creator&&enabled){const app=await getFamilyUseCases();const next=await app.familyPurchaseAccess(familyId,current);if(current()){setAccessView(view);setAccess(next);}}
   }catch{if(current())setMessage(tr('暂时无法确认家庭册状态，请再试一次。'));}
  })();
  return()=>{active=false;};
 },[view,capture,creator,enabled,familyId,retry,unlock.status?.owned]);
 async function run(work:(current:()=>boolean)=>Promise<void>){
  if(owner.current||!view||reading.blocked)return;
  owner.current=true;cancelled.current=false;setBusy(true);setMessage('');setFraction(0);
  const lease=capture(),current=()=>focus.current&&!cancelled.current&&lease();
  try{await work(current);}catch(error){if(current()){
   const code=error&&typeof error==='object'&&'code'in error?String(error.code):error instanceof Error?error.message:'';
   setMessage(tr(code==='PURCHASE_REQUIRED'||code.startsWith('EXPORT_')?'请先解锁或恢复购买，再保存家庭电子册。':code==='FAMILY_ALBUM_CHANGED'?'家庭册内容已更新，请刷新后重新制作。':code==='FAMILY_ALBUM_EXPORT_CLOSED'?'家庭电子册导出暂不可用，你仍可免费预览。':'这次未能完成，家庭记录仍然保留，请重试。'));
  }}finally{owner.current=false;if(focus.current)setBusy(false);}
 }
 function share(id?:string){if(!view||!creator||!enabled)return;const book=view;void run(async current=>{
  const made=await shareFamilyEpub(book,current,progress=>{if(current())setFraction(previous=>Math.max(previous,.05,progress.stage==='SHARE'?1:progress.total>0?.2+.7*progress.done/progress.total:.3));},id,made=>{if(current())setFresh(made);});
  if(current()){setFresh(made);setFraction(1);setEditions(await listFamilyEpubs(book,current));}
 });}
 function remove(id:string){if(!view||busy)return;const book=view,lease=capture();Alert.alert(tr('删除这版成品？'),tr('仅删除Lampy内这一版成品及其制作副本，不删除原记录。已保存到「文件」或「图书」的副本不会删除。'),[{text:tr('取消'),style:'cancel'},{text:tr('删除'),style:'destructive',onPress:()=>{if(!lease())return;void run(async current=>{await deleteFamilyEpub(book,id,current);if(current())setEditions(list=>list.filter(e=>e.id!==id));});}}]);}
 const visible=!reading.blocked&&view&&reading.valid();
 return <SettingsPage title={tr('电子册')} backLabel={tr('这一册')} accessibilityLabel={tr('家庭电子册')} onBack={()=>router.back()}>
  {visible?<View style={styles.body}>
   <View style={styles.cover} testID="family-epub-cover"><View style={{flex:1,alignItems:'center',justifyContent:'center'}}><LifeIcon name="album" size={38}/></View>{view.cover?<FamilyAlbumCoverPreview familyId={view.familyId} cover={view.cover} fill/>:null}<View pointerEvents="none" style={styles.binding}/></View>
   <Text accessibilityRole="header" style={styles.title}>{view.name}</Text>
   <ShowcaseNote>{tr('时序 · Chronicle')}</ShowcaseNote>
   <ShowcaseButton testID="family-epub-preview" tone="editorial" label={tr('全屏预览')} disabled={busy||!view.items.some(i=>i.status==='active')} onPress={()=>router.push({pathname:'/family-album-epub-preview',params:{familyId,albumId}})}/>
   <ShowcaseNote>{tr('免费翻阅整册，照片与声音都在。')}</ShowcaseNote>
   {creator?enabled&&view.access.canExport?<>
    {eligible?.canExport?<><ShowcaseUnlocked/><ShowcaseButton testID="family-epub-save" tone="editorial" label={tr('保存与分享电子册')} disabled={busy} onPress={()=>share()}/></>:<>
     {unlock.status?.owned?<ShowcaseButton testID="family-epub-unlock" label={tr('使用我的购买解锁这个家庭')} disabled={busy} onPress={()=>void run(async current=>{const app=await getFamilyUseCases();const next=await app.unlockFamilyPurchase(familyId,current);if(current()){setAccessView(view);setAccess(next);}})}/>:unlock.price?<ShowcaseButton testID="family-epub-purchase" label={tr('解锁导出 · {0}',[unlock.price])} disabled={busy||unlock.working} onPress={unlock.purchase}/>:<ShowcaseNote>{tr(unlock.loading?'正在确认购买状态…':'商品暂时不可用，请稍后再试。')}</ShowcaseNote>}
     <ShowcaseButton tone="quiet" label={tr('恢复购买')} disabled={busy||unlock.working} onPress={unlock.restore}/>
    </>}
    {unlock.notice?<ShowcaseNote>{unlock.notice}</ShowcaseNote>:null}
   </>:<ShowcaseNote>{tr('家庭电子册导出暂不可用，你仍可免费预览。')}</ShowcaseNote>:<ShowcaseNote>{tr('家庭成员可以免费预览，由家庭创建者保存与分享电子册。')}</ShowcaseNote>}
   {busy?<><EditionProgress fraction={fraction}/><ShowcaseButton tone="quiet" label={tr('取消制作电子册')} onPress={()=>{cancelled.current=true;setMessage(tr('本次制作已停止，请重新开始。'));}}/></>:null}
   {message?<ShowcaseNote live>{message}</ShowcaseNote>:null}
   {loadedView===view&&editions.length?<View style={styles.section}><Text accessibilityRole="header" style={styles.heading}>{tr('已生成的电子册')}</Text><ShowcaseNote>{tr('点按分享，左滑可分享或删除。')}</ShowcaseNote></View>:null}
   {(loadedView===view?[...editions].sort((a,b)=>Number(b.id===fresh)-Number(a.id===fresh)):[]).map(e=><AlbumEditionSwipeRow key={e.id} id={e.id} disabled={busy} onShare={()=>share(e.id)} onDelete={()=>remove(e.id)}><View style={styles.row}>{e.id===fresh?<Text style={{...type.meta,color:inkSoft}}>{tr('刚刚生成')}</Text>:null}<Text style={styles.heading}>{e.name}</Text><Text style={{...type.meta,color:inkSoft}}>{albumEditionDateLabel(e.createdAt)}</Text>{e.stale?<Text style={{...type.meta,color:inkSoft}}>{tr('家庭册内容已更新，请刷新后重新制作。')}</Text>:null}</View></AlbumEditionSwipeRow>)}
   <ShowcaseButton tone="quiet" label={tr('再试一次')} disabled={busy} onPress={()=>{setRetry(n=>n+1);unlock.retry();reading.retry();}}/>
  </View>:reading.error?<><ShowcaseNote>{tr('家庭内容或资格已变化，请重新核对。')}</ShowcaseNote><ShowcaseButton tone="quiet" label={tr('再试一次')} onPress={reading.retry}/></>:null}
 </SettingsPage>;
}
