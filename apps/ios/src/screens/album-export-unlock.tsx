import {unifiedPurchasesEnabled} from '../application/unified-purchases';
import {useEffect,useRef,useState} from 'react';
import {Pressable,View} from 'react-native';
import {albumExportConfig} from '../application/album-export-access';
import {albumExportAccess,observeExportEntitlements} from '../infrastructure/album-export-purchases';
import type {ExportPurchaseStatus} from '../../modules/lampy-export-purchases';
import {Text,type} from './life-text';
import {inkSoft,sage} from './life-page';
import {tr} from '../i18n';
export type AlbumExportUnlockState={
  status:ExportPurchaseStatus|null;loading:boolean;working:boolean;notice:string;
  /** Matching StoreKit product and its localized price, or null; never a hard-coded price. */
  price:string|null;
  /** Result of the last explicit tap, for callers that word it themselves. */
  outcome:'purchased'|'pending'|'cancelled'|'restored'|'not-restored'|'failed'|null;
  purchase():void;restore():void;retry():void;
};
/** Purchase, restore and status only. Never starts or shares an export. */
export function useAlbumExportUnlock(enabled=true):AlbumExportUnlockState{
  const [status,setStatus]=useState<ExportPurchaseStatus|null>(null);
  const [retry,setRetry]=useState(0);
  const [working,setWorking]=useState(false),[notice,setNotice]=useState(''),[loading,setLoading]=useState(enabled);
  const [outcome,setOutcome]=useState<AlbumExportUnlockState['outcome']>(null);
  const active=useRef(false),sequence=useRef(0),owner=useRef(false);
  useEffect(()=>{
    if(!enabled)return;
    active.current=true;
    const refresh=async()=>{const ticket=++sequence.current;try{const next=await albumExportAccess.status();if(active.current&&ticket===sequence.current){setStatus(next);setNotice('');setLoading(false);}}catch(error){if(active.current&&ticket===sequence.current){setNotice(tr(error&&typeof error==='object'&&'code' in error&&error.code==='UNAUTHENTICATED'?'请先到家庭页面登录Lampy，再解锁或恢复购买。':'暂时无法核对导出权益，请稍后再试。'));setLoading(false);}}};
    void refresh();const stop=observeExportEntitlements(()=>void refresh());
    return()=>{active.current=false;stop();};
  },[retry,enabled]);
  async function run(restore:boolean){
    if(owner.current)return;owner.current=true;setWorking(true);setNotice('');setOutcome(null);const ticket=++sequence.current;
    try{
      let message='';let result:AlbumExportUnlockState['outcome'];
      if(restore){const restored=await albumExportAccess.restore();result=restored.owned?'restored':'not-restored';message=tr(restored.owned?'已恢复导出权益。':'没有找到可恢复的导出购买。');}
      else {const bought=await albumExportAccess.purchase();result=bought.status==='pending'?'pending':bought.status==='cancelled'?'cancelled':'purchased';if(bought.status==='pending')message=tr('购买正在等待确认，确认后可继续导出。');else if(bought.status==='cancelled')message=tr('已取消购买。');else message=tr('导出权益已解锁，请点生成PDF继续。');}
      const next=await albumExportAccess.status();if(active.current&&ticket===sequence.current){setStatus(next);setNotice(message);setOutcome(result);setLoading(false);}
    }catch{if(active.current&&ticket===sequence.current){setNotice(tr('本次未能完成，请稍后重试或恢复购买。'));setOutcome('failed');setLoading(false);}}
    finally{owner.current=false;if(active.current)setWorking(false);}
  }
  const configured=albumExportConfig().productId;
  const product=status?.product;
  return {
    // Until the first answer arrives, an enabled check is still loading.
    status,loading:loading||(enabled&&status===null&&notice===''),working,notice,outcome,
    price:product?.id===configured&&product.price?product.price:null,
    purchase:()=>void run(false),restore:()=>void run(true),
    retry:()=>{setLoading(true);setNotice('');setRetry(value=>value+1);},
  };
}
export function AlbumExportUnlock(){
  const unified=unifiedPurchasesEnabled();
  const {status,loading,working,notice,price,purchase,restore,retry}=useAlbumExportUnlock();
  const product=status?.product;
  return <View testID="album-export-unlock" style={{gap:8}}>
    <Text style={{...type.meta,color:inkSoft}}>{tr(status?.owned?'已解锁最长30分钟录音和成品导出，无需重复购买。':'免费录音每段1分钟；一次购买解锁最长30分钟录音和全部成品导出。')}</Text>
    {unified?<Text style={{...type.meta,color:inkSoft}}>{tr('购买将关联当前Lampy账号，不随家庭转交。')}</Text>:null}
    {!status?.owned&&price?<Pressable accessibilityRole="button" disabled={working} accessibilityState={{disabled:working}} onPress={purchase} style={{minHeight:48,justifyContent:'center'}}><Text style={{...type.action,color:sage}}>{tr('解锁导出 · {0}',[price])}</Text></Pressable>:null}
    {loading?<Text style={{...type.meta,color:inkSoft}}>{tr('正在核对导出权益。')}</Text>:null}
    {!loading&&!status?.owned&&!product?<Text style={{...type.meta,color:inkSoft}}>{tr('商品暂时不可用，请稍后再试。')}</Text>:null}
    <Pressable accessibilityRole="button" disabled={working} accessibilityState={{disabled:working}} onPress={restore} style={{minHeight:48,justifyContent:'center'}}><Text style={{...type.action,color:sage}}>{tr('恢复购买')}</Text></Pressable>
    {!loading&&(notice||(!status?.owned&&!product))?<Pressable accessibilityRole="button" disabled={working} onPress={retry} style={{minHeight:48,justifyContent:'center'}}><Text style={{...type.action,color:sage}}>{tr('再试一次')}</Text></Pressable>:null}
    {notice?<Text accessibilityLiveRegion="polite" style={{...type.meta,color:inkSoft}}>{notice}</Text>:null}
  </View>;
}
