import {applePurchaseVerifier} from './purchase-apple-node';
const mockQuery=jest.fn(),mockDecode=jest.fn();
jest.mock('@apple/app-store-server-library',()=>({
 Environment:{SANDBOX:'Sandbox',PRODUCTION:'Production'},
 AppStoreServerAPIClient:jest.fn().mockImplementation(()=>({getTransactionInfo:(id:string)=>mockQuery(id)})),
 SignedDataVerifier:jest.fn().mockImplementation(()=>({verifyAndDecodeTransaction:(jws:string)=>mockDecode(jws)})),
}));
jest.mock('node:fs',()=>({readFileSync:jest.fn(()=>Buffer.from('test-certificate-or-key'))}));
const env={LAMPY_UNIFIED_PURCHASES:'1',LAMPY_PURCHASE_ENVIRONMENT:'Sandbox',LAMPY_UNIFIED_PRODUCT_ID:'unified',LAMPY_PURCHASE_KEY_FILE:'/private/key',LAMPY_PURCHASE_KEY_ID:'key',LAMPY_PURCHASE_ISSUER_ID:'issuer',LAMPY_PURCHASE_ROOT_CA_FILES:'/root-cert'};
const payload={bundleId:'app.lampy.ios',environment:'Sandbox',productId:'unified',type:'Non-Consumable',inAppOwnershipType:'PURCHASED',appAccountToken:'token',originalTransactionId:'100',transactionId:'100',signedDate:100};
beforeEach(()=>{jest.clearAllMocks();mockQuery.mockResolvedValue({signedTransactionInfo:'signed-by-Apple'});mockDecode.mockResolvedValue({...payload});});
it('is off by default, refuses missing secrets and never accepts the Xcode local environment',()=>{
 expect(applePurchaseVerifier({})).toBeUndefined();
 expect(()=>applePurchaseVerifier({...env,LAMPY_PURCHASE_KEY_FILE:''})).toThrow();
 expect(()=>applePurchaseVerifier({...env,LAMPY_PURCHASE_ENVIRONMENT:'Xcode'})).toThrow();
});
it('queries Apple then verifies the signed payload, retaining only scoped identifiers',async()=>{
 const result=await applePurchaseVerifier(env)!.verify('100');expect(mockQuery).toHaveBeenCalledWith('100');expect(mockDecode).toHaveBeenCalledWith('signed-by-Apple');
 expect(result).toEqual({transactionId:'100',originalTransactionId:'100',environment:'Sandbox',productId:'unified',appAccountToken:'token',revoked:false,signedAt:100});
});
it.each([{bundleId:'other'},{environment:'Production'},{productId:'other'},{type:'Consumable'},{inAppOwnershipType:'FAMILY_SHARED'},{appAccountToken:undefined}])('rejects wrong scope or ownership %j',async change=>{
 mockDecode.mockResolvedValue({...payload,...change});await expect(applePurchaseVerifier(env)!.verify('100')).rejects.toMatchObject({code:'PURCHASE_VERIFICATION_UNAVAILABLE'});
});
it('fails closed on signature failure and preserves verified revocation',async()=>{
 mockDecode.mockRejectedValueOnce(Error('signature failure'));await expect(applePurchaseVerifier(env)!.verify('100')).rejects.toMatchObject({code:'PURCHASE_VERIFICATION_UNAVAILABLE'});
 mockDecode.mockResolvedValue({...payload,revocationDate:1});expect((await applePurchaseVerifier(env)!.verify('100')).revoked).toBe(true);
});
