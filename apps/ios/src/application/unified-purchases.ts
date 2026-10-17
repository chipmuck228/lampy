import type {AlbumExportPurchases} from './album-export-access';
import {ApplicationError} from './errors';
import type {PurchaseContext} from '../family-api/purchase-types';
import type {ExportPurchasesNative} from '../../modules/lampy-export-purchases';

export function unifiedPurchasesEnabled(){return process.env.EXPO_PUBLIC_UNIFIED_PURCHASES==='1';}
export function createUnifiedPurchases(deps:{
  productId:string;native:ExportPurchasesNative;
  context():Promise<PurchaseContext>;
  claim(transactionId:string):Promise<PurchaseContext>;
  assertAccount(userId:string):Promise<void>;
}):AlbumExportPurchases {
  async function sync(context?:PurchaseContext) {
    const before=context??await deps.context();
    const proof=await deps.native.currentPurchase(deps.productId,before.appAccountToken);
    await deps.assertAccount(before.userId);
    if(!proof)return false;
    if(before.owned)return true;
    const result=await deps.claim(proof.transactionId);
    if(result.userId!==before.userId)throw new ApplicationError('STALE_FAMILY_REQUEST','Account changed.');
    return result.owned;
  }
  return {
    hasEntitlement:()=>sync(),
    async status(){
      const owned=await sync();
      const native=await deps.native.status(deps.productId);
      return {owned,product:native.product};
    },
    async purchase(){
      const before=await deps.context();
      if(await sync(before))return {status:'already-owned'};
      await deps.assertAccount(before.userId);
      const result=await deps.native.purchaseForAccount(deps.productId,before.appAccountToken);
      await deps.assertAccount(before.userId);
      if(result.status==='purchased'||result.status==='already-owned') {
        if(!await sync())throw new ApplicationError('PURCHASE_VERIFICATION_UNAVAILABLE','Purchase verification must complete before access is granted.');
      }
      return result;
    },
    async restore(){
      const before=await deps.context();await deps.assertAccount(before.userId);
      await deps.native.restore(deps.productId);await deps.assertAccount(before.userId);
      const owned=await sync();const status=await deps.native.status(deps.productId);
      return {owned,product:status.product};
    },
  };
}
