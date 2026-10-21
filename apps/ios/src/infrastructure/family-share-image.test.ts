import { convertExpoImageForFamilyShare } from './family-share-image';
import { familyImagesNative } from '../../modules/lampy-family-images';
import { sampleJpegBytes } from '../family-api/media-validate';
jest.mock('../../modules/lampy-family-images', () => ({familyImagesNative:jest.fn()}));
it('uses only a native in-memory copy and strips any encoder metadata before upload', async () => {
  const plain=sampleJpegBytes(), source=new Uint8Array([1,2,3]);
  const decorated=new Uint8Array([255,216,255,225,0,6,71,80,83,0,...plain.subarray(2)]);
  const prepare=jest.fn(async()=>({base64:btoa(String.fromCharCode(...decorated)),mimeType:'image/jpeg',width:3,height:2}));
  jest.mocked(familyImagesNative).mockReturnValue({prepare});
  expect(await convertExpoImageForFamilyShare(source,'image/heic')).toEqual({bytes:plain,mimeType:'image/jpeg'});
  expect(prepare).toHaveBeenCalledWith('AQID','image/heic'); expect(source).toEqual(new Uint8Array([1,2,3]));
});
it('fails closed on a missing native build or malformed encoder result', async () => {
  jest.mocked(familyImagesNative).mockReturnValue(null);
  await expect(convertExpoImageForFamilyShare(new Uint8Array([1]),'image/jpeg')).rejects.toMatchObject({code:'SHARE_IMAGE_CONVERSION_UNAVAILABLE'});
  jest.mocked(familyImagesNative).mockReturnValue({prepare:async()=>({base64:'AA==',mimeType:'image/jpeg',width:1,height:1})});
  await expect(convertExpoImageForFamilyShare(new Uint8Array([1]),'image/jpeg')).rejects.toThrow();
});
