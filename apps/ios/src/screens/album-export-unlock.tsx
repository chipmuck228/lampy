import {unifiedPurchasesEnabled} from '../application/unified-purchases';
import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Pressable,View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {albumExportConfig} from '../application/album-export-access';
import {albumExportAccess,observeExportEntitlements} from '../infrastructure/album-export-purchases';
import type {ExportPurchaseStatus} from '../../modules/lampy-export-purchases';
import {Text,type} from './life-text';
import {inkSoft,sage} from './life-page';
import {tr} from '../i18n';
import {subscribeFamilySafety} from '../application/family-safety-events';
import {useDeviceLock} from './device-lock-context';
import {ShowcaseButton} from './album-export-showcase';
export type AlbumExportUnlockState={
  status:ExportPurchaseStatus|null;loading:boolean;working:boolean;notice:string;retryable:boolean;
  /** Matching StoreKit product and its localized price, or null; never a hard-coded price. */
  price:string|null;
  /** Result of the last explicit tap, for callers that word it themselves. */
  outcome:'purchased'|'pending'|'cancelled'|'restored'|'not-restored'|'failed'|'verification-pending'|null;
  purchase():void;restore():void;retry():void;
};
/** Purchase, restore and status only. Never starts or shares an export. */
export function useAlbumExportUnlock(enabled=true):AlbumExportUnlockState{
  const [status,setStatus]=useState<ExportPurchaseStatus|null>(null);
  const [retry,setRetry]=useState(0);
  const [working,setWorking]=useState(false),[notice,setNotice]=useState(''),[loading,setLoading]=useState(enabled),[retryable,setRetryable]=useState(false);
  const [outcome,setOutcome]=useState<AlbumExportUnlockState['outcome']>(null);
  const lock=useDeviceLock();
  const [foreground,setForeground]=useState(AppState.currentState==='active');
  const usable=enabled&&foreground&&!lock?.snapshot.locked;
  const active=useRef(false),sequence=useRef(0),owner=useRef(false);
  useEffect(()=>{const sub=AppState.addEventListener('change',state=>{if(state!=='active'){sequence.current++;setStatus(null);setNotice('');}setForeground(state==='active');});return()=>sub.remove();},[]);
  useEffect(()=>subscribeFamilySafety(()=>{sequence.current++;setStatus(null);setNotice('');setOutcome(null);setRetry(n=>n+1);}),[]);
  useFocusEffect(useCallback(()=>{
    void retry; // Explicit retry restarts the focused status lease.
    if(!usable){active.current=false;sequence.current++;setStatus(null);setNotice('');setLoading(false);return;}
    active.current=true;
    const refresh=async()=>{
      if(owner.current)return;
      const ticket=++sequence.current;setWorking(false);setLoading(true);setStatus(null);setRetryable(false);
      try{const next=await albumExportAccess.status();if(active.current&&ticket===sequence.current){setStatus(next);setNotice('');setLoading(false);}}
      catch(error){if(active.current&&ticket===sequence.current){setStatus(null);setNotice(tr(error&&typeof error==='object'&&'code' in error&&error.code==='UNAUTHENTICATED'?'请先到家庭页面登录Lampy，再解锁或恢复购买。':'暂时无法核对导出权益，请稍后再试。'));setRetryable(true);setLoading(false);}}
    };
    void refresh();const stop=observeExportEntitlements(()=>void refresh());
    return()=>{active.current=false;sequence.current++;stop();};
  },[retry,usable]));
  async function run(restore:boolean){
    if(owner.current||loading||!active.current||!usable)return;
    owner.current=true;setWorking(true);setNotice('');setRetryable(false);setOutcome(null);const ticket=++sequence.current;
    let result:AlbumExportUnlockState['outcome']=null;
    try{
      let message='';
      if(restore){const restored=await albumExportAccess.restore();result=restored.owned?'restored':'not-restored';message=tr(restored.owned?'已恢复导出权益。':'没有找到可恢复的导出购买。');}
      else {const bought=await albumExportAccess.purchase();result=bought.status==='pending'?'pending':bought.status==='cancelled'?'cancelled':'purchased';if(bought.status==='pending')message=tr('购买正在等待确认，确认后可继续导出。');else if(bought.status==='cancelled')message=tr('已取消购买。');else message=tr(unifiedPurchasesEnabled()?'已解锁个人册导出，也可启用本人创建家庭的导出。':'已解锁，可以导出电子册了。');}
      if(!active.current||ticket!==sequence.current)return;
      // Cancellation and Ask to Buy are outcomes, not retryable errors.
      if(result==='cancelled'||result==='pending'){setNotice(message);setOutcome(result);return;}
      const next=await albumExportAccess.status();if(active.current&&ticket===sequence.current){setStatus(next);const uncertain=(result==='purchased'||result==='restored')&&!next.owned;setNotice(uncertain?tr('购买结果正在核对，请勿重复付款。请稍后检查状态或恢复购买。'):message);setOutcome(uncertain?'verification-pending':result);setRetryable(uncertain);setLoading(false);}
    }catch(error){if(active.current&&ticket===sequence.current){
      const code=error&&typeof error==='object'&&'code'in error?String(error.code):'';
      const pending=result==='purchased'||result==='restored'||code==='PURCHASE_VERIFICATION_UNAVAILABLE';
      setStatus(null);setNotice(tr(pending?'购买结果正在核对，请勿重复付款。请稍后检查状态或恢复购买。':code==='UNAUTHENTICATED'?'请先到家庭页面登录Lampy，再解锁或恢复购买。':code==='PURCHASE_ACCOUNT_MISMATCH'?'这笔购买关联其他Lampy账号，请切回购买时的账号。':code==='STALE_FAMILY_REQUEST'?'账号已变化，请重新检查当前账号的购买状态。':'本次未能完成，请稍后重试或恢复购买。'));
      setOutcome(pending?'verification-pending':'failed');setRetryable(true);setLoading(false);
    }}
    finally{owner.current=false;if(active.current){setWorking(false);if(ticket!==sequence.current)setRetry(n=>n+1);}}
  }
  const configured=albumExportConfig().productId;
  const product=status?.product;
  return {
    // Until the first answer arrives, an enabled check is still loading.
    status:usable?status:null,loading:usable&&(loading||(status===null&&notice==='')),working,notice:usable?notice:'',outcome,retryable:usable&&retryable,
    price:usable&&outcome!=='verification-pending'&&outcome!=='pending'&&product?.id===configured&&product.price?product.price:null,
    purchase:()=>void run(false),restore:()=>void run(true),
    retry:()=>{if(owner.current)return;setLoading(true);setNotice('');setOutcome(null);setRetry(value=>value+1);},
  };
}
export function AlbumExportUnlock(){
  const unified=unifiedPurchasesEnabled();
  const {status,loading,working,notice,price,purchase,restore,retry,retryable}=useAlbumExportUnlock();
  return <View testID="album-export-unlock" style={{gap:8}}>
    <Text style={{...type.meta,color:inkSoft}}>{tr(status?.owned?'已解锁最长30分钟录音和EPUB保存与分享，无需重复购买。':'免费录音每段1分钟；一次购买解锁最长30分钟录音和EPUB保存与分享。')}</Text>
    {unified?<Text style={{...type.meta,color:inkSoft}}>{tr('购买将关联当前Lampy账号，不随家庭转交。')}</Text>:null}
    <Text style={{...type.meta,color:inkSoft}}>{tr('同一Lampy账号一次解锁个人册及本人创建家庭的EPUB保存与分享；家庭成员仍可免费预览。')}</Text>
    {!status?.owned&&price?<ShowcaseButton testID="album-export-unlock-purchase" label={tr('解锁导出 · {0}',[price])} disabled={working} onPress={purchase}/>:null}
    {loading?<Text style={{...type.meta,color:inkSoft}}>{tr('正在核对导出权益。')}</Text>:null}
    {!loading&&!notice&&!status?.owned&&!price?<Text style={{...type.meta,color:inkSoft}}>{tr('商品暂时不可用，请稍后再试。')}</Text>:null}
    <Pressable accessibilityRole="button" disabled={working||loading} accessibilityState={{disabled:working||loading}} onPress={restore} style={{minHeight:48,justifyContent:'center'}}><Text style={{...type.action,color:sage}}>{tr('恢复购买')}</Text></Pressable>
    {!loading&&(retryable||(!notice&&!status?.owned&&!price))?<Pressable accessibilityRole="button" disabled={working} onPress={retry} style={{minHeight:48,justifyContent:'center'}}><Text style={{...type.action,color:sage}}>{tr('再试一次')}</Text></Pressable>:null}
    {notice?<Text accessibilityLiveRegion="polite" style={{...type.meta,color:inkSoft}}>{notice}</Text>:null}
  </View>;
}
