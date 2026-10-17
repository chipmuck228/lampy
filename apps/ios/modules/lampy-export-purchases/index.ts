import {requireOptionalNativeModule} from 'expo';
export type ExportProduct = {id:string;name:string;price:string};
export type ExportPurchaseStatus = {owned:boolean;product:ExportProduct|null};
export type ExportPurchaseOutcome = {status:'purchased'|'cancelled'|'pending'|'already-owned'};
export type ExportPurchasesNative = {
  hasEntitlement(productId:string):Promise<boolean>;
  status(productId:string):Promise<ExportPurchaseStatus>;
  purchase(productId:string):Promise<ExportPurchaseOutcome>;
  restore(productId:string):Promise<ExportPurchaseStatus>;
  addListener(event:'onEntitlementsChanged',listener:()=>void):{remove():void};
};
export function exportPurchasesNative():ExportPurchasesNative|null {
  try {return requireOptionalNativeModule<ExportPurchasesNative>('LampyExportPurchases');}
  catch {return null;}
}
