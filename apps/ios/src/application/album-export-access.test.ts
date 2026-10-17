import {albumExportEntryOpen,createAlbumExportAccess,type AlbumExportConfig} from './album-export-access';
function setup(){
 let config:AlbumExportConfig={enabled:true,paid:true,productId:'app.lampy.export'};
 const native={hasEntitlement:jest.fn(async()=>false),status:jest.fn(async()=>({owned:false,product:{id:config.productId,name:'Export',price:'¥6'}})),purchase:jest.fn(async()=>({status:'purchased' as const})),restore:jest.fn(async()=>({owned:true,product:null}))};
 const access=createAlbumExportAccess({config:()=>config,dev:true,evaluation:()=> '1',purchases:()=>native});
 return {access,native,change:(next:Partial<AlbumExportConfig>)=>{config={...config,...next};}};
}
it('is default closed in release, including a development flag, and rejects unpaid export including development evaluation',async()=>{
 expect(albumExportEntryOpen(false,{enabled:false,paid:false,productId:''},'1')).toBe(false);
 expect(albumExportEntryOpen(true,{enabled:false,paid:false,productId:''},'1')).toBe(true);
 const f=setup();f.change({paid:false});await expect(f.access.assert(()=>true)).rejects.toMatchObject({code:'EXPORT_CLOSED'});expect(f.native.hasEntitlement).not.toHaveBeenCalled();expect(f.native.purchase).not.toHaveBeenCalled();
});
it('does not let the evaluation flag bypass enabled paid export, and generation never purchases',async()=>{
 const f=setup();await expect(f.access.assert(()=>true)).rejects.toMatchObject({code:'EXPORT_PURCHASE_REQUIRED'});expect(f.native.purchase).not.toHaveBeenCalled();
 f.native.hasEntitlement.mockResolvedValue(true);await expect(f.access.assert(()=>true)).resolves.toBeUndefined();
 f.native.hasEntitlement.mockResolvedValue(false);await expect(f.access.assert(()=>true)).rejects.toMatchObject({code:'EXPORT_PURCHASE_REQUIRED'});
});
it('fails closed without native configuration or native verification',async()=>{
 const f=setup();f.change({productId:''});await expect(f.access.assert(()=>true)).rejects.toMatchObject({code:'EXPORT_PURCHASE_UNAVAILABLE'});
 const missing=createAlbumExportAccess({config:()=>({enabled:true,paid:true,productId:'id'}),dev:false,purchases:()=>null});await expect(missing.assert(()=>true)).rejects.toMatchObject({code:'EXPORT_PURCHASE_UNAVAILABLE'});
 f.change({productId:'id'});f.native.hasEntitlement.mockRejectedValue(Error('verification'));await expect(f.access.assert(()=>true)).rejects.toThrow('verification');
});
it('rejects late entitlements after blur or switch changes',async()=>{
 const f=setup();let current=true;f.native.hasEntitlement.mockImplementation(async()=>{current=false;return true;});await expect(f.access.assert(()=>current)).rejects.toMatchObject({code:'EXPORT_CANCELLED'});
 f.native.hasEntitlement.mockImplementation(async()=>{f.change({productId:'different'});return true;});await expect(f.access.assert(()=>true)).rejects.toMatchObject({code:'EXPORT_CLOSED'});
});
it('skips purchase for owners and restores without buying',async()=>{
 const f=setup();f.native.hasEntitlement.mockResolvedValue(true);await expect(f.access.purchase()).resolves.toEqual({status:'already-owned'});expect(f.native.purchase).not.toHaveBeenCalled();
 await f.access.restore();expect(f.native.restore).toHaveBeenCalledTimes(1);expect(f.native.purchase).not.toHaveBeenCalled();
});
it('serializes purchase/restore and never retries a purchase automatically',async()=>{
 const f=setup();let finish!:(value:{status:'purchased'})=>void;f.native.purchase.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const first=f.access.purchase();while(!finish)await Promise.resolve();await expect(f.access.purchase()).rejects.toMatchObject({code:'EXPORT_PURCHASE_UNAVAILABLE'});await expect(f.access.restore()).rejects.toMatchObject({code:'EXPORT_PURCHASE_UNAVAILABLE'});finish({status:'purchased'});await first;expect(f.native.purchase).toHaveBeenCalledTimes(1);
});

it('does not open the purchase sheet if the flag changes during the ownership precheck',async()=>{
 const f=setup();f.native.hasEntitlement.mockImplementationOnce(async()=>{f.change({paid:false});return false;});
 await expect(f.access.purchase()).rejects.toMatchObject({code:'EXPORT_CLOSED'});expect(f.native.purchase).not.toHaveBeenCalled();
});

it('evaluation-only access never grants free PDF creation',async()=>{
 const f=setup();f.change({enabled:false,paid:false});
 await expect(f.access.assert(()=>true)).rejects.toMatchObject({code:'EXPORT_CLOSED'});
 expect(f.native.hasEntitlement).not.toHaveBeenCalled();
});
