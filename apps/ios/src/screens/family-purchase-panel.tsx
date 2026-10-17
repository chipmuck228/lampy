import {useEffect,useRef,useState} from 'react';
import {Pressable,View} from 'react-native';
import {getFamilyUseCases} from '../application/container';
import type {FamilyExportEligibility} from '../family-api/purchase-types';
import {AlbumExportUnlock} from './album-export-unlock';
import {tr} from '../i18n';
import {Text,type} from './life-text';
import {inkSoft,sage} from './life-page';

export function FamilyPurchasePanel({familyId}:{familyId:string}) {
  const [access,setAccess]=useState<FamilyExportEligibility|null>(null);
  const [failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[purchase,setPurchase]=useState(false);
  const active=useRef(true),owner=useRef(false);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  async function check(unlock=false) {
    if(owner.current)return;owner.current=true;setBusy(true);setFailed(false);
    try {
      const app=await getFamilyUseCases();
      const result=unlock?await app.unlockFamilyPurchase(familyId,()=>active.current):await app.familyPurchaseAccess(familyId,()=>active.current);
      if(active.current){setAccess(result);setPurchase(false);}
    } catch(error) {
      if(active.current){setAccess(null);setFailed(true);if(error&&typeof error==='object'&&'code' in error&&error.code==='PURCHASE_REQUIRED')setPurchase(true);}
    } finally {owner.current=false;if(active.current)setBusy(false);}
  }
  return <View style={{gap:8}}>
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void check()} style={{minHeight:48,justifyContent:'center'}}><Text style={{...type.action,color:sage}}>{tr('查看家庭导出资格')}</Text></Pressable>
    {access?<Text style={{...type.meta,color:inkSoft}}>{tr(access.canExport?'本家庭已解锁，可以制作PDF。':access.eligible?'已解锁本家庭的导出资格；家庭文件导出尚未开放。':'本家庭尚未解锁导出资格；只有当前创建者可以解锁。')}</Text>:null}
    {access&&!access.eligible&&access.reason==='locked'||purchase?<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void check(true)} style={{minHeight:48,justifyContent:'center'}}><Text style={{...type.action,color:sage}}>{tr('使用我的购买解锁这个家庭')}</Text></Pressable>:null}
    {purchase?<AlbumExportUnlock/>:null}
    {failed?<Text accessibilityLiveRegion="polite" style={{...type.meta,color:inkSoft}}>{tr('家庭资格暂时无法核对，请重试。')}</Text>:null}
  </View>;
}
