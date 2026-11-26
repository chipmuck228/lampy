import {Platform} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import {ApplicationError} from '../application/errors';

export function inviteImageSaveSupported(platform=Platform.OS,version:string|number=Platform.Version){return platform==='ios'||(platform==='android'&&Number(version)>=30);}

/** Saves only an explicit invitation PNG; never reads or enumerates the photo library. */
export async function saveInviteImage(qr:string,current:()=>Promise<boolean>){
 if(!inviteImageSaveSupported())throw new ApplicationError('INVITE_IMAGE_UNAVAILABLE','This device cannot add invitation images.');
 const match=/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(qr);
 if(!match||match[1].length>200000)throw new ApplicationError('INVITE_IMAGE_INVALID','Invalid invitation image.');
 if(!await current())return false;
 const permission=await MediaLibrary.requestPermissionsAsync(true,[]);
 if(!await current())return false;
 if(!permission.granted)throw new ApplicationError('INVITE_IMAGE_PERMISSION','Photo addition was not allowed.');
 if(!FileSystem.cacheDirectory)throw new ApplicationError('INVITE_IMAGE_UNAVAILABLE','Cache is unavailable.');
 const path=FileSystem.cacheDirectory+'lampy-invite-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'.png';
 try{
  await FileSystem.writeAsStringAsync(path,match[1],{encoding:FileSystem.EncodingType.Base64});
  if(!await current())return false;
  await MediaLibrary.Asset.create(path);
  return true;
 }finally{try{await FileSystem.deleteAsync(path,{idempotent:true});}catch{/* No invitation contents are logged. */}}
}
