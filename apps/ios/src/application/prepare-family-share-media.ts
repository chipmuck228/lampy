import { ApplicationError } from './errors';
import { assertMediaPayload } from '../family-api/media-validate';
import { photoMetadataIsClean } from '../family-api/photo-metadata';
export type FamilyImageConverter = (bytes: Uint8Array, mime: string) => Promise<{ bytes: Uint8Array; mimeType: string }>;
export async function prepareFamilyShareMedia(bytes: Uint8Array, mimeType: string, converter?: FamilyImageConverter) {
  const raw = mimeType.split(';')[0].trim().toLowerCase();
  const type = raw === 'image/jpg' ? 'image/jpeg' : raw;
  if (type.startsWith('image/') && bytes.length > 32 * 1024 * 1024) throw new ApplicationError('SHARE_IMAGE_SOURCE_TOO_LARGE', 'Image source exceeds the preparation limit.');
  if (type.startsWith('image/') && !bytes.length) throw new ApplicationError('MEDIA_CORRUPT', 'Empty image.');
  if (['image/jpeg','image/png'].includes(type) && bytes.length <= 8 * 1024 * 1024) assertMediaPayload(bytes, type);
  let outgoing = { bytes, mimeType: type };
  if (type.startsWith('image/')) {
    // An already clean JPEG/PNG needs no lossy render and no native fallback.
    let alreadyClean = false;
    try { alreadyClean = photoMetadataIsClean(bytes, type); } catch { /* other input requires a renderer */ }
    if (alreadyClean) return { bytes: new Uint8Array(bytes), mimeType: assertMediaPayload(bytes, type) };
    if (!converter) throw new ApplicationError('SHARE_IMAGE_CONVERSION_UNAVAILABLE', 'Update the image sharing installation.');
    try {
      outgoing = await converter(new Uint8Array(bytes), type);
      if (!['image/jpeg', 'image/png'].includes(outgoing.mimeType) || !photoMetadataIsClean(outgoing.bytes, outgoing.mimeType)) throw new Error('Unsafe image copy');
    } catch (error) {
      if (error instanceof ApplicationError && ['SHARE_IMAGE_CONVERSION_UNAVAILABLE','SHARE_IMAGE_SOURCE_TOO_LARGE','SHARE_IMAGE_DIMENSIONS','SHARE_IMAGE_DECODE_FAILED','SHARE_IMAGE_RENDER_FAILED','SHARE_IMAGE_ENCODE_FAILED','SHARE_IMAGE_OUTPUT_TOO_LARGE'].includes(error.code)) throw error;
      throw new ApplicationError('SHARE_IMAGE_CONVERSION_FAILED', 'Image copy could not be prepared.');
    }
  }
  return { ...outgoing, mimeType: assertMediaPayload(outgoing.bytes, outgoing.mimeType) };
}
