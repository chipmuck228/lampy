import {unifiedPurchasesEnabled} from '../application/unified-purchases';
import {useEffect,useRef,useState} from 'react';
import {Pressable,View} from 'react-native';
import {albumExportConfig} from '../application/album-export-access';
import {albumExportAccess,observeExportEntitlements} from '../infrastructure/album-export-purchases';
import type {ExportPurchaseStatus} from '../../modules/lampy-export-purchases';
import {Text,type} from './life-text';
import {inkSoft,sage} from './life-page';
import {tr} from '../i18n';
export function AlbumExportUnlock(){
  const unified=unifiedPurchasesEnabled();
  const [status,setStatus]=useState<ExportPurchaseStatus|null>(null);
  const [retry,setRetry]=useState(0);
  const [working,setWorking]=useState(false),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true);
  const active=useRef(false),sequence=useRef(0),owner=useRef(false);
  useEffect(()=>{
    active.current=true;
    const refresh=async()=>{const ticket=++sequence.current;try{const next=await albumExportAccess.status();if(active.current&&ticket===sequence.current){setStatus(next);setNotice('');setLoading(false);}}catch(error){if(active.current&&ticket===sequence.current){setNotice(tr(error&&typeof error==='object'&&'code' in error&&error.code==='UNAUTHENTICATED'?'请先到家庭页面登录Lampy，再解锁或恢复购买。':'暂时无法核对导出权益，请稍后再试。'));setLoading(false);}}};
    void refresh();const stop=observeExportEntitlements(()=>void refresh());
    return()=>{active.current=false;stop();};
  },[retry]);
  async function run(restore:boolean){
    if(owner.current)return;owner.current=true;setWorking(true);setNotice('');const ticket=++sequence.current;
    try{
      let message='';
      if(restore){const restored=await albumExportAccess.restore();message=tr(restored.owned?'已恢复导出权益。':'没有找到可恢复的导出购买。');}
      else {const result=await albumExportAccess.purchase();if(result.status==='pending')message=tr('购买正在等待确认，确认后可继续导出。');else if(result.status==='cancelled')message=tr('已取消购买。');else message=tr('导出权益已解锁，请点生成PDF继续。');}
      const next=await albumExportAccess.status();if(active.current&&ticket===sequence.current){setStatus(next);setNotice(message);setLoading(false);}
    }catch{if(active.current&&ticket===sequence.current){setNotice(tr('本次未能完成，请稍后重试或恢复购买。'));setLoading(false);}}
    finally{owner.current=false;if(active.current)setWorking(false);}
  }
  const configured=albumExportConfig().productId;
  const product=status?.product;
  return <View testID="album-export-unlock" style={{gap:8}}>
    <Text style={{...type.meta,color:inkSoft}}>{tr(status?.owned?'已解锁最长30分钟录音和成品导出，无需重复购买。':'免费录音每段1分钟；一次购买解锁最长30分钟录音和全部成品导出。')}</Text>
    {unified?<Text style={{...type.meta,color:inkSoft}}>{tr('购买将关联当前Lampy账号，不随家庭转交。')}</Text>:null}
    {!status?.owned&&product?.id===configured&&product.price?<Pressable accessibilityRole="button" disabled={working} accessibilityState={{disabled:working}} onPress={()=>void run(false)} style={{minHeight:48,justifyContent:'center'}}><Text style={{...type.action,color:sage}}>{tr('解锁导出 · {0}',[product.price])}</Text></Pressable>:null}
    {loading?<Text style={{...type.meta,color:inkSoft}}>{tr('正在核对导出权益。')}</Text>:null}
    {!loading&&!status?.owned&&!product?<Text style={{...type.meta,color:inkSoft}}>{tr('商品暂时不可用，请稍后再试。')}</Text>:null}
    <Pressable accessibilityRole="button" disabled={working} accessibilityState={{disabled:working}} onPress={()=>void run(true)} style={{minHeight:48,justifyContent:'center'}}><Text style={{...type.action,color:sage}}>{tr('恢复购买')}</Text></Pressable>
    {!loading&&(notice||(!status?.owned&&!product))?<Pressable accessibilityRole="button" disabled={working} onPress={()=>{setLoading(true);setNotice('');setRetry(value=>value+1);}} style={{minHeight:48,justifyContent:'center'}}><Text style={{...type.action,color:sage}}>{tr('再试一次')}</Text></Pressable>:null}
    {notice?<Text accessibilityLiveRegion="polite" style={{...type.meta,color:inkSoft}}>{notice}</Text>:null}
  </View>;
}
