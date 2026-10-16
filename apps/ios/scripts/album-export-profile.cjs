'use strict';
function configureAlbumExport(config,env){
  for(const key of ['EXPO_PUBLIC_ALBUM_EXPORT_ENABLED','EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED']) {
    if(env[key]!==undefined&&!['','0','1'].includes(env[key]))throw new Error(`Invalid binary export switch: ${key}`);
  }
  const enabled=env.EXPO_PUBLIC_ALBUM_EXPORT_ENABLED==='1';
  const paid=enabled&&env.EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED==='1';
  const id=(env.EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID||'').trim();
  if(paid&&!/^[A-Za-z0-9][A-Za-z0-9._-]{2,199}$/.test(id))throw new Error('Paid album export requires the configured App Store non-consumable product ID');
  return {...config,ios:{...config.ios,infoPlist:{...config.ios?.infoPlist,LampyPaidExportEnabled:paid,LampyExportProductID:paid?id:''}}};
}
module.exports={configureAlbumExport};
