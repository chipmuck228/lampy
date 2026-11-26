import {createUnifiedPurchases} from './unified-purchases';
import type {ExportPurchasesNative,ExportPurchaseOutcome} from '../../modules/lampy-export-purchases';
function fixture(){
  const context={userId:'a',appAccountToken:'token-a',owned:false,createdFamilyCount:1,canCreateFamily:false};
  const native={currentPurchase:jest.fn(async()=>null as {transactionId:string}|null),status:jest.fn(async()=>({owned:true,product:{id:'unified',name:'Unlock',price:'¥18'}})),purchaseForAccount:jest.fn(async():Promise<ExportPurchaseOutcome>=>({status:'cancelled'})),restore:jest.fn(async()=>({owned:true,product:null}))};
  const claim=jest.fn(async()=>({...context,owned:true}));const assertAccount=jest.fn(async(_id:string)=>{});
  const api=createUnifiedPurchases({productId:'unified',native:native as unknown as ExportPurchasesNative,context:async()=>({...context}),claim,assertAccount});
  return {api,native,context,claim,assertAccount};
}
it('uses refreshed server ownership on another device without a local transaction',async()=>{
 const f=fixture();f.context.owned=true;expect(await f.api.hasEntitlement()).toBe(true);expect(f.native.currentPurchase).not.toHaveBeenCalled();expect(f.claim).not.toHaveBeenCalled();
});
it('does not trust native owned alone for a different or unentitled Lampy account',async()=>{
 const f=fixture();expect(await f.api.hasEntitlement()).toBe(false);expect(f.claim).not.toHaveBeenCalled();
});
it('claims only a verified token-bound native transaction and uses server ownership',async()=>{
 const f=fixture();f.native.currentPurchase.mockResolvedValue({transactionId:'100'});
 expect(await f.api.hasEntitlement()).toBe(true);expect(f.claim).toHaveBeenCalledWith('100');
 f.claim.mockResolvedValue({...f.context,owned:false});expect(await f.api.hasEntitlement()).toBe(false);
});
it('cancelled purchase does not claim or trigger export; sends the opaque account token to StoreKit',async()=>{
 const f=fixture();expect(await f.api.purchase()).toEqual({status:'cancelled'});
 expect(f.native.purchaseForAccount).toHaveBeenCalledWith('unified','token-a');expect(f.claim).not.toHaveBeenCalled();
});
it('account changes during purchase preflight prevent purchase',async()=>{
 const f=fixture();f.assertAccount.mockRejectedValue(Error('changed'));await expect(f.api.purchase()).rejects.toThrow('changed');expect(f.native.purchaseForAccount).not.toHaveBeenCalled();
});
it('restore never trusts the native restore boolean and does not purchase',async()=>{
 const f=fixture();expect((await f.api.restore()).owned).toBe(false);expect(f.native.purchaseForAccount).not.toHaveBeenCalled();
});
it('pending never claims a transaction, and success requires server confirmation',async()=>{
 const f=fixture();f.native.purchaseForAccount.mockResolvedValueOnce({status:'pending'});
 expect(await f.api.purchase()).toEqual({status:'pending'});expect(f.claim).not.toHaveBeenCalled();
 f.native.purchaseForAccount.mockImplementationOnce(async()=>{f.native.currentPurchase.mockResolvedValue({transactionId:'100'});return {status:'purchased'};});
 expect(await f.api.purchase()).toEqual({status:'purchased'});expect(f.claim).toHaveBeenCalledWith('100');
});

it('keeps verified access when product loading fails without inventing a price',async()=>{
 const f=fixture();f.context.owned=true;f.native.status.mockRejectedValue(Error('store offline'));
 expect(await f.api.status()).toEqual({owned:true,product:null});
});
it('rejects a switched account even when the previous account owns access',async()=>{
 const f=fixture();f.context.owned=true;f.assertAccount.mockRejectedValue(Error('changed'));
 await expect(f.api.hasEntitlement()).rejects.toThrow('changed');expect(f.native.purchaseForAccount).not.toHaveBeenCalled();
});
it('does not offer another payment to a server-verified owner',async()=>{
 const f=fixture();f.context.owned=true;expect(await f.api.purchase()).toEqual({status:'already-owned'});
 expect(f.native.purchaseForAccount).not.toHaveBeenCalled();
});
it('refuses a claim returned for another account',async()=>{
 const f=fixture();f.native.currentPurchase.mockResolvedValue({transactionId:'100'});f.claim.mockResolvedValue({...f.context,userId:'b',owned:true});
 await expect(f.api.hasEntitlement()).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
});
it('reports verification pending when StoreKit completes but the server is unavailable',async()=>{
 const f=fixture();f.native.purchaseForAccount.mockImplementationOnce(async()=>{f.native.currentPurchase.mockResolvedValue({transactionId:'100'});f.claim.mockRejectedValue({code:'NETWORK'});return {status:'purchased'};});
 await expect(f.api.purchase()).rejects.toMatchObject({code:'PURCHASE_VERIFICATION_UNAVAILABLE'});
});
