import { familyImagesNative } from '../../modules/lampy-family-images';
import { ApplicationError } from '../application/errors';
import { stripPhotoMetadata } from '../family-api/photo-metadata';

// Independent in-memory sRGB copy. Native bakes orientation/color before the
// allow-list removes all metadata containers, including any encoder ICC.
// Missing native support must never fall back to uploading the original bytes.
export async function convertExpoImageForFamilyShare(bytes: Uint8Array, mimeType: string) {
  const native = familyImagesNative();
  if (!native) throw new ApplicationError('SHARE_IMAGE_CONVERSION_UNAVAILABLE', 'Image sharing requires an updated native installation.');
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  const result = await native.prepare(globalThis.btoa(binary), mimeType);
  if (!['image/jpeg', 'image/png'].includes(result.mimeType)) throw new Error('Invalid image copy');
  const decoded = globalThis.atob(result.base64), output = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) output[i] = decoded.charCodeAt(i);
  return { bytes: stripPhotoMetadata(output, result.mimeType), mimeType: result.mimeType };
}
