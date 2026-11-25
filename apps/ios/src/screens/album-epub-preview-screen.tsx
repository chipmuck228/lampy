import {useCallback,useEffect,useLayoutEffect,useRef,useState,type ComponentType} from 'react';
import {AppState,Pressable,StyleSheet,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {requireAlbumEpubView} from '../../modules/lampy-album-layout';
import {createAlbumEpubPreview,type EpubPreview} from '../infrastructure/album-epub-preview';
import {useDeviceLock} from './device-lock-context';
import {firstSearchParam} from './lookback-origin';
import {Text} from './life-text';
import {tr} from '../i18n';
import {EditionProgress} from './edition-progress';
const NativeReader=requireAlbumEpubView() as ComponentType<{rootUri:string;documentUri:string;style:object;onReady():void;onFailure():void;onPageTurn(e:{nativeEvent:{direction:number}}):void}>|null;
export default function AlbumEpubPreviewScreen(){
 const id=firstSearchParam(useLocalSearchParams<{id?:string|string[]}>().id)??'',router=useRouter(),lock=useDeviceLock(),insets=useSafeAreaInsets();
 const [focused,setFocused]=useState(false);
 const [foreground,setForeground]=useState(AppState.currentState==='active');
 const blocked=!foreground||!!lock?.snapshot.locked;
 const denied=useRef(blocked);useLayoutEffect(()=>{denied.current=blocked;},[blocked]);
 const [book,setBook]=useState<EpubPreview|null>(null),[page,setPage]=useState(0),[failed,setFailed]=useState(false),[fraction,setFraction]=useState(0),[retry,setRetry]=useState(0),[loading,setLoading]=useState(true);
 useEffect(()=>{const sub=AppState.addEventListener('change',state=>{denied.current=state!=='active'||!!lock?.snapshot.locked;setForeground(state==='active');});return()=>sub.remove();},[lock?.snapshot.locked]);
 useFocusEffect(useCallback(()=>{
  setFocused(true);
  let active=true,owned:EpubPreview|null=null;
  setBook(null);setFailed(false);setPage(0);setFraction(0);setLoading(true);
  const valid=()=>active&&!denied.current&&AppState.currentState==='active';
  if(!blocked&&id&&NativeReader)void createAlbumEpubPreview(id,valid,n=>{if(valid())setFraction(n);}).then(async result=>{
   if(!valid()){await result.dispose();return;}owned=result;setBook(result);
  }).catch(()=>{if(valid())setFailed(true);});
  return()=>{active=false;setFocused(false);setBook(null);if(owned)void owned.dispose().catch(()=>undefined);};
 // Retry intentionally restarts this focus lease without changing its source.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[id,blocked,retry]));
 const turn=(step:number)=>{const next=Math.max(0,Math.min((book?.pages.length??1)-1,page+step));if(next===page)return;setFailed(false);setLoading(true);setPage(next);};
 return <View style={[styles.root,{paddingTop:insets.top,paddingBottom:insets.bottom,paddingLeft:insets.left,paddingRight:insets.right}]} testID="epub-fullscreen-preview">
  <StatusBar hidden={focused&&!blocked}/>
  <View style={styles.bar}><Pressable accessibilityRole="button" accessibilityLabel={tr('关闭预览')} onPress={()=>router.back()} style={styles.hit}><Text style={styles.control}>{tr('关闭')}</Text></Pressable><Text style={styles.name} numberOfLines={1}>{!blocked?book?.name:tr('电子册预览')}</Text><View style={styles.hit}/></View>
  {!blocked&&book&&NativeReader?<NativeReader key={book.pages[page].uri} style={styles.reader} rootUri={book.rootUri} documentUri={book.pages[page].uri} onReady={()=>setLoading(false)} onFailure={()=>setFailed(true)} onPageTurn={e=>turn(e.nativeEvent.direction)}/>:<View style={styles.reader}/>}
  {!blocked&&(!book||failed||!NativeReader)?<View style={styles.notice}><Text style={styles.control}>{!NativeReader?tr('请更新Lampy后使用电子册预览。'):failed?tr('这次未能打开预览，原记录仍然保留。'):tr('正在准备预览…')}</Text>{NativeReader&&!failed?<EditionProgress fraction={fraction} dark/>:null}{NativeReader&&failed?<Pressable accessibilityRole="button" onPress={()=>setRetry(n=>n+1)} style={styles.hit}><Text style={styles.control}>{tr('再试一次')}</Text></Pressable>:null}</View>:null}
  {!blocked&&book?<View style={styles.bar}><Pressable accessibilityRole="button" accessibilityLabel={tr('上一页')} disabled={page===0} onPress={()=>turn(-1)} style={styles.hit}><Text style={[styles.control,page===0&&styles.dim]}>‹</Text></Pressable><Text accessibilityLiveRegion="polite" style={styles.counter}>{page+1} / {book.pages.length}{loading?' · '+tr('正在打开…'):''}</Text><Pressable accessibilityRole="button" accessibilityLabel={tr('下一页')} disabled={page===book.pages.length-1} onPress={()=>turn(1)} style={styles.hit}><Text style={[styles.control,page===book.pages.length-1&&styles.dim]}>›</Text></Pressable></View>:null}
 </View>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#151C19'},bar:{minHeight:52,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14},hit:{minWidth:60,minHeight:48,alignItems:'center',justifyContent:'center'},control:{color:'#E2E8DE',fontSize:18},name:{flex:1,textAlign:'center',color:'#E2E8DE',fontSize:16},counter:{color:'#C4D3CD',fontSize:14},reader:{flex:1},notice:{position:'absolute',top:'40%',left:36,right:36,gap:20,alignItems:'stretch'},dim:{opacity:.3}});
