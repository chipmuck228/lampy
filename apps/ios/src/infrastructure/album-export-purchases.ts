import {albumExportConfig,createAlbumExportAccess} from '../application/album-export-access';
import {exportPurchasesNative} from '../../modules/lampy-export-purchases';
export const albumExportAccess=createAlbumExportAccess({config:albumExportConfig,dev:typeof __DEV__!=='undefined'&&__DEV__,evaluation:()=>process.env.EXPO_PUBLIC_ALBUM_PRINT_EVAL,purchases:()=>{
  const native=exportPurchasesNative();if(!native)return null;
  const id=albumExportConfig().productId;
  return {hasEntitlement:()=>native.hasEntitlement(id),status:()=>native.status(id),purchase:()=>native.purchase(id),restore:()=>native.restore(id)};
}});
export function observeExportEntitlements(listener:()=>void) {
  const config=albumExportConfig();
  if(!config.enabled||!config.paid||!config.productId)return ()=>{};
  const sub=exportPurchasesNative()?.addListener('onEntitlementsChanged',listener);
  return ()=>sub?.remove();
}
