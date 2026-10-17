export type AlbumExportConfig = {enabled:boolean;paid:boolean;productId:string};
export function albumExportConfig():AlbumExportConfig {
  return {enabled:process.env.EXPO_PUBLIC_ALBUM_EXPORT_ENABLED==='1',paid:process.env.EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED==='1',productId:(process.env.EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID||'').trim()};
}
export function albumExportEntryOpen(dev:boolean,config=albumExportConfig(),evaluation=process.env.EXPO_PUBLIC_ALBUM_PRINT_EVAL){
  return config.enabled || (dev && evaluation==='1');
}
export class AlbumExportAccessError extends Error {
  constructor(readonly code:'EXPORT_CLOSED'|'EXPORT_PURCHASE_REQUIRED'|'EXPORT_PURCHASE_UNAVAILABLE'|'EXPORT_CANCELLED') {super(code);}
}
export type AlbumExportPurchases = {
  hasEntitlement():Promise<boolean>;
  status():Promise<{owned:boolean;product:{id:string;name:string;price:string}|null}>;
  purchase():Promise<{status:'purchased'|'cancelled'|'pending'|'already-owned'}>;
  restore():Promise<{owned:boolean;product:{id:string;name:string;price:string}|null}>;
};
export function createAlbumExportAccess(deps:{config:()=>AlbumExportConfig;dev:boolean;evaluation?:()=>string|undefined;purchases:()=>AlbumExportPurchases|null}) {
  const requirePurchases=()=>{
    const config=deps.config();
    if(!config.enabled||!config.paid||!config.productId)throw new AlbumExportAccessError('EXPORT_PURCHASE_UNAVAILABLE');
    const native=deps.purchases();if(!native)throw new AlbumExportAccessError('EXPORT_PURCHASE_UNAVAILABLE');return native;
  };
  let busy=false;
  async function purchaseWork<T>(work:()=>Promise<T>):Promise<T>{
    if(busy)throw new AlbumExportAccessError('EXPORT_PURCHASE_UNAVAILABLE');
    busy=true;try{return await work();}finally{busy=false;}
  }
  return {
    async assert(current:()=>boolean) {
      if(!current())throw new AlbumExportAccessError('EXPORT_CANCELLED');
      const initial=deps.config();
      if(!albumExportEntryOpen(deps.dev,initial,deps.evaluation?.()))throw new AlbumExportAccessError('EXPORT_CLOSED');
      // Development evaluation may not bypass a configured paid production path.
      if(initial.enabled&&initial.paid){
        const owned=await requirePurchases().hasEntitlement();
        if(!current())throw new AlbumExportAccessError('EXPORT_CANCELLED');
        const latest=deps.config();
        if(!latest.enabled||latest.paid!==initial.paid||latest.productId!==initial.productId)throw new AlbumExportAccessError('EXPORT_CLOSED');
        if(!owned)throw new AlbumExportAccessError('EXPORT_PURCHASE_REQUIRED');
      }
      if(!current())throw new AlbumExportAccessError('EXPORT_CANCELLED');
    },
    status:()=>requirePurchases().status(),
    purchase:()=>purchaseWork(async()=>{
      const initial=deps.config();const native=requirePurchases();const owned=await native.hasEntitlement();
      const latest=deps.config();
      if(!latest.enabled||!latest.paid||latest.productId!==initial.productId)throw new AlbumExportAccessError('EXPORT_CLOSED');
      if(owned)return {status:'already-owned' as const};
      return native.purchase();
    }),
    restore:()=>purchaseWork(()=>requirePurchases().restore()),
  };
}
