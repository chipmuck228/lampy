// Persist identifiers and verification state, never raw receipts/JWS or Apple account details.
export type VerifiedPurchase = {
  originalTransactionId: string;
  transactionId: string;
  environment: 'Sandbox' | 'Production';
  productId: string;
  appAccountToken: string;
  revoked: boolean;
  signedAt:number;
};
export type PurchaseRecord = VerifiedPurchase & {key:string;userId:string;checkedAt:string};
export type FamilyPurchaseGrant = {familyId:string;purchaseKey:string;unlockedBy:string;unlockedAt:string};
export type PurchaseContext = {userId:string;appAccountToken:string;owned:boolean;createdFamilyCount:number;canCreateFamily:boolean};
export type FamilyExportEligibility = {familyId:string;eligible:boolean;reason:'eligible'|'not-creator'|'locked';canExport:false};
export type PurchaseApi = {
  context(session:string):Promise<PurchaseContext>;
  claim(session:string,transactionId:string):Promise<PurchaseContext>;
  familyAccess(session:string,familyId:string):Promise<FamilyExportEligibility>;
  unlockFamily(session:string,familyId:string):Promise<FamilyExportEligibility>;
};
export type PurchaseVerifier = {environment:'Sandbox'|'Production';verify(transactionId:string):Promise<VerifiedPurchase>};
