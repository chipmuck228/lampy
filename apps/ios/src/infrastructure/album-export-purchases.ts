import {createUnifiedPurchases,unifiedPurchasesEnabled} from '../application/unified-purchases';
import {albumExportConfig,createAlbumExportAccess} from '../application/album-export-access';
import {exportPurchasesNative} from '../../modules/lampy-export-purchases';
export function getConfiguredPurchases(){
  const native=exportPurchasesNative();if(!native)return null;
  const id=albumExportConfig().productId;
  if(unifiedPurchasesEnabled()) {
    const app=async()=> (await import('../application/container')).getFamilyUseCases();
    return createUnifiedPurchases({productId:id,native,
      context:async()=> (await app()).purchaseAccountContext(),
      claim:async transactionId=> (await app()).claimPurchase(transactionId),
      assertAccount:async userId=> (await app()).assertPurchaseAccount(userId),
    });
  }
  return {hasEntitlement:()=>native.hasEntitlement(id),status:()=>native.status(id),purchase:()=>native.purchase(id),restore:()=>native.restore(id)};
}
export const albumExportAccess=createAlbumExportAccess({config:albumExportConfig,dev:typeof __DEV__!=='undefined'&&__DEV__,evaluation:()=>process.env.EXPO_PUBLIC_ALBUM_PRINT_EVAL,purchases:getConfiguredPurchases});
export function observeExportEntitlements(listener:()=>void) {
  const config=albumExportConfig();
  if(!config.enabled||!config.paid||!config.productId)return ()=>{};
  const sub=exportPurchasesNative()?.addListener('onEntitlementsChanged',listener);
  return ()=>sub?.remove();
}
