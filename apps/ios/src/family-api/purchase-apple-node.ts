import {readFileSync} from 'node:fs';
import {AppStoreServerAPIClient,Environment,SignedDataVerifier} from '@apple/app-store-server-library';
import {FamilyError} from './errors';
import type {PurchaseVerifier,VerifiedPurchase} from './purchase-types';

// No client-supplied JWS/owned flag is trusted. Query Apple again for each privileged operation.
export function applePurchaseVerifier(env:Partial<NodeJS.ProcessEnv>):PurchaseVerifier|undefined {
  if(env.LAMPY_UNIFIED_PURCHASES!=='1')return undefined;
  const mode=env.LAMPY_PURCHASE_ENVIRONMENT;
  if(mode!=='Sandbox'&&mode!=='Production')throw Error('Purchase environment must be Sandbox or Production. Local Xcode transactions are not accepted by the API.');
  const productId=env.LAMPY_UNIFIED_PRODUCT_ID?.trim();
  const keyFile=env.LAMPY_PURCHASE_KEY_FILE;
  const keyId=env.LAMPY_PURCHASE_KEY_ID;
  const issuer=env.LAMPY_PURCHASE_ISSUER_ID;
  const roots=env.LAMPY_PURCHASE_ROOT_CA_FILES?.split(',').map((s:string)=>s.trim()).filter(Boolean);
  const appId=env.LAMPY_PURCHASE_APP_APPLE_ID?Number(env.LAMPY_PURCHASE_APP_APPLE_ID):undefined;
  if(!productId||!keyFile||!keyId||!issuer||!roots?.length||(mode==='Production'&&(!appId||!Number.isSafeInteger(appId))))throw Error('Unified purchases require product, server key, issuer, Apple root certificates and production app Apple ID.');
  const environment=mode==='Sandbox'?Environment.SANDBOX:Environment.PRODUCTION;
  const client=new AppStoreServerAPIClient(readFileSync(keyFile,'utf8'),keyId,issuer,'app.lampy.ios',environment);
  const verifier=new SignedDataVerifier(roots.map((file:string)=>readFileSync(file)),true,environment,'app.lampy.ios',appId);
  return {
    environment:mode,
    async verify(transactionId) {
      let timer:ReturnType<typeof setTimeout>|undefined;
      try {
        const work=async():Promise<VerifiedPurchase>=>{
          const result=await client.getTransactionInfo(transactionId);
          if(!result.signedTransactionInfo)throw Error('missing');
          const tx=await verifier.verifyAndDecodeTransaction(result.signedTransactionInfo);
          if(tx.bundleId!=='app.lampy.ios'||tx.environment!==mode||tx.productId!==productId||tx.type!=='Non-Consumable'||tx.inAppOwnershipType!=='PURCHASED'||!tx.appAccountToken||!tx.originalTransactionId||!tx.transactionId||!Number.isFinite(tx.signedDate)||!tx.signedDate)throw Error('invalid');
          return {originalTransactionId:tx.originalTransactionId,transactionId:tx.transactionId,environment:mode,productId,appAccountToken:tx.appAccountToken,revoked:tx.revocationDate!==undefined,signedAt:tx.signedDate!};
        };
        return await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),8000);})]);
      } catch {
        // Do not expose upstream keys, signed payloads, account identifiers or URLs.
        throw new FamilyError('PURCHASE_VERIFICATION_UNAVAILABLE','Purchase verification is unavailable.');
      } finally {if(timer)clearTimeout(timer);}
    },
  };
}
