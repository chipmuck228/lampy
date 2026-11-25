import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Alert,AppState,StyleSheet,View} from 'react-native';
import {Image} from 'expo-image';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {getUseCases} from '../application/container';
import type {AlbumLayoutInput} from '../application/album-layout-input';
import {selectBookCover} from '../application/album-book-plan';
import {albumExportConfig} from '../application/album-export-access';
import {purchasesSupported} from '../application/mobile-capabilities';
import {createPersonalEpubSnapshot,discardUnfinishedEpubSnapshot,listEpubSnapshots,type SavedEpubSnapshot} from '../infrastructure/album-epub-snapshots';
import {shareAlbumEpub} from '../infrastructure/album-epub-files';
import {listSavedAlbumPrints,shareSavedAlbumPrint,type SavedPrintSummary} from '../infrastructure/album-print-files';
import {deleteSavedAlbumEdition} from '../infrastructure/album-edition-delete';
import {albumEditionDateLabel,albumFileSizeLabel} from '../application/album-export-showcase';
import {useAlbumExportUnlock} from './album-export-unlock';
import {useDeviceLock} from './device-lock-context';
import {firstSearchParam} from './lookback-origin';
import {SettingsPage} from './settings-chrome';
import {AlbumEditionSwipeRow} from './album-edition-swipe-row';
import {ShowcaseButton,ShowcaseNote,ShowcaseUnlocked,EditionProgress} from './album-export-showcase';
import {Text,type} from './life-text';
import {paper,ink,inkSoft,sage} from './life-page';
import {appLanguage,tr} from '../i18n';
type Feedback={id:string;pending:boolean;fraction:number;message:string};
export default function AlbumPrintScreen(){
 const router=useRouter(),id=firstSearchParam(useLocalSearchParams<{id?:string|string[]}>().id)??'',lock=useDeviceLock(),config=albumExportConfig();
 const [foreground,setForeground]=useState(AppState.currentState==='active');
 const blocked=!purchasesSupported()||!foreground||!!lock?.snapshot.locked;
 const denied=useRef(blocked);useLayoutEffect(()=>{denied.current=blocked;},[blocked]);
 const unlock=useAlbumExportUnlock(!blocked&&config.enabled&&config.paid);
 const owned=config.enabled&&config.paid&&!!unlock.status?.owned;
 const [input,setInput]=useState<AlbumLayoutInput|null>(null),[editions,setEditions]=useState<SavedEpubSnapshot[]>([]),[history,setHistory]=useState<SavedPrintSummary[]>([]);
 const [ready,setReady]=useState(false),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState<Feedback|null>(null),[fresh,setFresh]=useState<{albumId:string;id:string}|null>(null);
 const active=useRef(false),generation=useRef(0),owner=useRef<number|null>(null),cancelled=useRef(false);
 useEffect(()=>{const sub=AppState.addEventListener('change',state=>{denied.current=state!=='active'||!!lock?.snapshot.locked;setForeground(state==='active');if(state!=='active')generation.current++;});return()=>sub.remove();},[lock?.snapshot.locked]);
 useFocusEffect(useCallback(()=>{
  active.current=true;const epoch=++generation.current;
  setInput(null);setEditions([]);setHistory([]);setReady(false);setFailed(false);setFeedback(null);setBusy(owner.current!==null);
  const valid=()=>active.current&&!denied.current&&generation.current===epoch&&AppState.currentState==='active';
  if(!blocked&&id)void Promise.allSettled([
   getUseCases().then(app=>app.readAlbumForContinuousReading(id,{privateUnlocked:valid()})),listEpubSnapshots(id),listSavedAlbumPrints(id)
  ]).then(([book,epubs,pdfs])=>{if(!valid())return;if(book.status==='fulfilled')setInput(book.value.input);if(epubs.status==='fulfilled')setEditions(epubs.value);if(pdfs.status==='fulfilled')setHistory(pdfs.value);setFailed([book,epubs,pdfs].some(r=>r.status==='rejected'));setReady(true);});
  return()=>{active.current=false;generation.current++;};
 // Retry intentionally restarts this focus lease without changing its source.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[id,blocked,retry]));
 const current=(epoch:number)=>active.current&&!denied.current&&AppState.currentState==='active'&&generation.current===epoch;
 async function run(work:(valid:()=>boolean)=>Promise<void>){
  if(blocked||!ready||owner.current!==null)return;
  const epoch=++generation.current;owner.current=epoch;cancelled.current=false;setBusy(true);setFeedback(null);
  const valid=()=>current(epoch)&&!cancelled.current;
  try{await work(valid);}catch{if(valid())setFeedback({id:'new',pending:false,fraction:0,message:tr('这次未能分享，请稍后重试。')});}
  finally{if(owner.current===epoch){owner.current=null;if(active.current)setBusy(false);}}
 }
 function electronic(edition?:{id:string}){
  if(!owned){unlock.retry();setFeedback({id:edition?.id??'new',pending:false,fraction:0,message:tr('请先解锁导出，或恢复已有购买。')});return;}
  void run(async valid=>{
   const target=edition?.id??'new';let made:string|undefined,published=false,fraction=0;
   const update=(next:number)=>{fraction=Math.max(fraction,Math.min(.98,next));if(valid())setFeedback({id:target,pending:true,fraction,message:tr('正在制作这一册…')});};
   update(.01);
   try{
    let editionId=edition?.id;
    if(!editionId){const snapshot=await createPersonalEpubSnapshot(id,'imagebook',valid,(n,total)=>update(total>0?.25*n/total:.02));editionId=snapshot.id;made=snapshot.id;}
    if(!valid())return;
    await shareAlbumEpub(editionId,valid,progress=>{
     if(!valid())return;
     if(progress.stage==='SHARE'){published=true;if(made)setFresh({albumId:id,id:made});setFeedback({id:target,pending:false,fraction:1,message:''});return;}
     const stages:Record<string,number>={READ_EDITION:.25,AUTHORIZE:.27,READ_MEDIA:.3,CONVERT_IMAGE:.3,PACKAGE:.65,WRITE_FILE:.72,VERIFY_FILE:.9,PUBLISH:.96};
     update(progress.stage==='CONVERT_IMAGE'&&progress.total>0?.3+.34*progress.done/progress.total:stages[progress.stage]??fraction);
    });
    if(valid()){if(made)setFresh({albumId:id,id:made});setFeedback({id:target,pending:false,fraction:1,message:''});}
   }catch(error){
    if(valid()&&!published){const code=error&&typeof error==='object'&&'code'in error?String(error.code):'';
     const access=code.startsWith('EXPORT_');if(access)unlock.retry();
     setFeedback({id:target,pending:false,fraction:0,message:tr(access?'请先解锁导出，或恢复已有购买。':code==='EPUB_DISK_FULL'?'本机可用空间不足，请腾出空间后重试。':code==='EPUB_UNSUPPORTED_AUDIO'?'这段声音暂不支持电子册，请稍后再试。':'这次未能制作电子册，请重试。原记录仍然保留。')});
    }
   }finally{
    if(made){await discardUnfinishedEpubSnapshot(made);const saved=await listEpubSnapshots(id);if(valid())setEditions(saved);}
   }
  });
 }
 function remove(editionId:string){
  if(busy||blocked)return;
  const epoch=generation.current;
  Alert.alert(tr('删除这版成品？'),tr('仅删除Lampy内这一版成品及其制作副本，不删除原记录。已保存到「文件」或「图书」的副本不会删除。'),[
   {text:tr('取消'),style:'cancel'},{text:tr('删除'),style:'destructive',onPress:()=>{if(!current(epoch))return;void run(async valid=>{await deleteSavedAlbumEdition(editionId,id,valid);if(valid()){setEditions(a=>a.filter(e=>e.id!==editionId));setHistory(a=>a.filter(e=>e.id!==editionId));}});}}
  ]);
 }
 const assets=Object.fromEntries((input?.entries??[]).flatMap(e=>e.media.filter(m=>m.role==='image'&&m.uri).map(m=>[m.assetId,{path:m.uri!,mime:'image/jpeg'}])));
 const cover=input?selectBookCover({input,assets,dates:{},id:'cover',createdAt:'',language:appLanguage}):'';
 const freshId=fresh?.albumId===id?fresh.id:null;
 const pending=feedback?.pending??false;
 const showFeedback=(editionId:string)=>feedback?.id===editionId?<View>{pending?<><EditionProgress fraction={feedback.fraction}/><ShowcaseButton tone="quiet" label={tr('取消制作电子册')} onPress={()=>{cancelled.current=true;setFeedback({id:editionId,pending:false,fraction:0,message:tr('本次制作已停止，请重新开始。')});}}/></>:feedback.message?<ShowcaseNote live>{feedback.message}</ShowcaseNote>:null}</View>:null;
 return <SettingsPage title={tr('电子册')} backLabel={tr('这一册')} accessibilityLabel={tr('电子册')} onBack={()=>router.back()}>
  {!blocked?<View style={styles.body}>
   {input?<><View style={styles.cover}>{cover?<Image source={{uri:cover}} style={StyleSheet.absoluteFill} contentFit="cover"/>:null}<View style={styles.binding}/></View><Text accessibilityRole="header" style={styles.title}>{input.album.name}</Text><Text style={styles.meta}>{tr('时序 · Chronicle')}</Text></>:null}
   <ShowcaseButton testID="album-export-preview" tone="editorial" label={tr('全屏预览')} disabled={!input?.entries.length||busy} onPress={()=>router.push(`/albums/${id}/preview`)}/>
   <ShowcaseNote>{tr('免费翻阅整册，照片与声音都在。')}</ShowcaseNote>
   {owned?<><ShowcaseUnlocked/><ShowcaseButton testID="album-export-create-epub" tone="editorial" label={tr('保存与分享电子册')} disabled={busy||!input?.entries.length} onPress={()=>electronic()}/></>:config.enabled&&config.paid?<View style={styles.section}>
    {unlock.price?<><ShowcaseButton testID="album-export-purchase" label={tr('解锁导出 · {0}',[unlock.price])} disabled={busy||unlock.working} onPress={unlock.purchase}/><ShowcaseNote>{tr('一次购买，之后每一册、每一次导出都不再收费。')}</ShowcaseNote></>:unlock.loading?<ShowcaseNote>{tr('正在确认购买状态…')}</ShowcaseNote>:<><ShowcaseNote>{tr('商品暂时不可用，请稍后再试。')}</ShowcaseNote><ShowcaseButton tone="quiet" label={tr('再试一次')} onPress={unlock.retry}/></>}
    <ShowcaseButton tone="quiet" label={tr('恢复购买')} disabled={busy||unlock.working} onPress={unlock.restore}/>
   </View>:<ShowcaseNote>{tr('导出暂不可用，你仍可免费预览整册。')}</ShowcaseNote>}
   {unlock.notice&&!unlock.loading?<ShowcaseNote live>{unlock.notice}</ShowcaseNote>:null}
   {showFeedback('new')}
   {failed?<><ShowcaseNote>{tr('部分内容暂时读不到，原记录仍然保留。')}</ShowcaseNote><ShowcaseButton tone="quiet" label={tr('再试一次')} disabled={busy} onPress={()=>setRetry(n=>n+1)}/></>:null}
   {editions.length?<View style={styles.section}><Text accessibilityRole="header" style={styles.heading}>{tr('已生成的电子册')}</Text><ShowcaseNote>{tr('点按分享，左滑可分享或删除。')}</ShowcaseNote></View>:null}
   {[...editions].sort((a,b)=>Number(b.id===freshId)-Number(a.id===freshId)).map(edition=><View key={edition.id}><AlbumEditionSwipeRow id={edition.id} disabled={busy} onDelete={()=>remove(edition.id)} onShare={()=>electronic(edition)}><View style={styles.row}>{edition.id===freshId?<Text testID="album-export-just-created" style={styles.meta}>{tr('刚刚生成')}</Text>:null}<Text style={styles.heading}>{edition.name}</Text><Text style={styles.meta}>{albumEditionDateLabel(edition.createdAt)}</Text></View></AlbumEditionSwipeRow>{showFeedback(edition.id)}</View>)}
   {history.length?<View style={styles.section}><Text accessibilityRole="header" style={styles.heading}>{tr('历史文件')}</Text></View>:null}
   {history.map(edition=><AlbumEditionSwipeRow key={edition.id} id={edition.id} disabled={busy} onDelete={()=>remove(edition.id)} onShare={()=>{void run(valid=>shareSavedAlbumPrint(edition,valid).then(()=>undefined));}}><View style={styles.row}><Text style={styles.heading}>{edition.name}</Text><Text style={styles.meta}>PDF · {albumEditionDateLabel(edition.createdAt)} · {albumFileSizeLabel(edition.pdf.bytes)}</Text></View></AlbumEditionSwipeRow>)}
  </View>:null}
 </SettingsPage>;
}
const styles=StyleSheet.create({body:{gap:16},section:{gap:10,paddingTop:20},cover:{height:210,backgroundColor:'#E2E8DE',overflow:'hidden'},binding:{position:'absolute',left:0,top:0,bottom:0,width:7,backgroundColor:sage},title:{fontFamily:'Baskerville',fontSize:32,lineHeight:44,color:ink},heading:{...type.action,color:ink},meta:{...type.meta,color:inkSoft},row:{gap:6,paddingVertical:14},paper:{backgroundColor:paper}});
