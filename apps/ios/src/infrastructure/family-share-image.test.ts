import { convertExpoImageForFamilyShare } from './family-share-image';
import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator } from 'expo-image-manipulator';
jest.mock('expo-file-system/legacy',()=>({deleteAsync:jest.fn(async()=>undefined)}));
jest.mock('expo-image-manipulator',()=>({ImageManipulator:{manipulate:jest.fn()},SaveFormat:{JPEG:'jpeg'}}));
it('converts a copied source without crop/resize and deletes only the generated file',async()=>{
  const image={saveAsync:jest.fn(async()=>({uri:'file:///cache/generated.jpg',base64:btoa('\xff\xd8\xff')})),release:jest.fn()};
  const context={renderAsync:jest.fn(async()=>image),release:jest.fn()};
  jest.mocked(ImageManipulator.manipulate).mockReturnValue(context as never);
  expect(await convertExpoImageForFamilyShare(new Uint8Array([1,2,3]),'image/heic')).toEqual({bytes:new Uint8Array([255,216,255]),mimeType:'image/jpeg'});
  expect(ImageManipulator.manipulate).toHaveBeenCalledWith('data:image/heic;base64,AQID');
  expect(image.saveAsync).toHaveBeenCalledWith({format:'jpeg',compress:0.9,base64:true});
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///cache/generated.jpg',{idempotent:true});
  expect(image.release).toHaveBeenCalled();expect(context.release).toHaveBeenCalled();
});
it('cleans generated output and native refs even when the converted bytes are unavailable',async()=>{
  const image={saveAsync:jest.fn(async()=>({uri:'file:///cache/failed.jpg'})),release:jest.fn()};
  const context={renderAsync:jest.fn(async()=>image),release:jest.fn()};
  jest.mocked(ImageManipulator.manipulate).mockReturnValue(context as never);
  await expect(convertExpoImageForFamilyShare(new Uint8Array([1]),'image/heic')).rejects.toThrow('Converted image bytes unavailable');
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///cache/failed.jpg',{idempotent:true});
  expect(image.release).toHaveBeenCalled();expect(context.release).toHaveBeenCalled();
});
