import { ApplicationError } from './errors';
import { assertMediaPayload } from '../family-api/media-validate';
import { photoMetadataIsClean } from '../family-api/photo-metadata';
export type FamilyImageConverter = (bytes: Uint8Array, mime: string) => Promise<{ bytes: Uint8Array; mimeType: string }>;
export async function prepareFamilyShareMedia(bytes: Uint8Array, mimeType: string, converter?: FamilyImageConverter) {
  const raw = mimeType.split(';')[0].trim().toLowerCase(), type = raw === 'image/jpg' ? 'image/jpeg' : raw;
  if (['image/jpeg', 'image/png'].includes(type)) assertMediaPayload(bytes, type);
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
      if (error instanceof ApplicationError && error.code === 'SHARE_IMAGE_CONVERSION_UNAVAILABLE') throw error;
      throw new ApplicationError('SHARE_IMAGE_CONVERSION_FAILED', 'Image copy could not be prepared.');
    }
  }
  return { ...outgoing, mimeType: assertMediaPayload(outgoing.bytes, outgoing.mimeType) };
}
