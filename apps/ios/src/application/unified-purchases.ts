import {purchasesSupported} from './mobile-capabilities';
import type {AlbumExportPurchases} from './album-export-access';
import {ApplicationError} from './errors';
import type {PurchaseContext} from '../family-api/purchase-types';
import type {ExportPurchasesNative} from '../../modules/lampy-export-purchases';

export function unifiedPurchasesEnabled(){return purchasesSupported()&&process.env.EXPO_PUBLIC_UNIFIED_PURCHASES==='1';}
export function createUnifiedPurchases(deps:{
  productId:string;native:ExportPurchasesNative;
  context():Promise<PurchaseContext>;
  claim(transactionId:string):Promise<PurchaseContext>;
  assertAccount(userId:string):Promise<void>;
}):AlbumExportPurchases {
  async function sync(context?:PurchaseContext) {
    const before=context??await deps.context();
    // context() refreshes Apple-verified records for the authenticated Lampy account.
    // A local StoreKit transaction is needed to claim a purchase, not to reuse it on another device.
    await deps.assertAccount(before.userId);
    if(before.owned)return true;
    const proof=await deps.native.currentPurchase(deps.productId,before.appAccountToken);
    await deps.assertAccount(before.userId);
    if(!proof)return false;
    const result=await deps.claim(proof.transactionId);
    if(result.userId!==before.userId)throw new ApplicationError('STALE_FAMILY_REQUEST','Account changed.');
    await deps.assertAccount(before.userId);
    return result.owned;
  }
  return {
    hasEntitlement:()=>sync(),
    async status(){
      const before=await deps.context();
      const owned=await sync(before);
      let product=null;
      try {product=(await deps.native.status(deps.productId)).product;}
      catch(error){if(!owned)throw error;}
      await deps.assertAccount(before.userId);
      return {owned,product};
    },
    async purchase(){
      const before=await deps.context();
      if(await sync(before))return {status:'already-owned'};
      await deps.assertAccount(before.userId);
      const result=await deps.native.purchaseForAccount(deps.productId,before.appAccountToken);
      await deps.assertAccount(before.userId);
      if(result.status==='purchased'||result.status==='already-owned') {
        try {
          const owned=await sync();
          await deps.assertAccount(before.userId);
          if(!owned)throw new ApplicationError('PURCHASE_VERIFICATION_UNAVAILABLE','Purchase verification must complete before access is granted.');
        } catch(error) {
          if(error&&typeof error==='object'&&'code'in error&&['STALE_FAMILY_REQUEST','UNAUTHENTICATED','PURCHASE_ACCOUNT_MISMATCH'].includes(String(error.code)))throw error;
          throw new ApplicationError('PURCHASE_VERIFICATION_UNAVAILABLE','StoreKit completed; server verification is still required.');
        }
      }
      return result;
    },
    async restore(){
      const before=await deps.context();await deps.assertAccount(before.userId);
      await deps.native.restore(deps.productId);await deps.assertAccount(before.userId);
      const owned=await sync();
      let product=null;try{product=(await deps.native.status(deps.productId)).product;}catch(error){if(!owned)throw error;}
      await deps.assertAccount(before.userId);
      return {owned,product};
    },
  };
}
