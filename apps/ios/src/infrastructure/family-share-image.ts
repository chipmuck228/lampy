/* eslint-disable @typescript-eslint/no-require-imports */
import { ApplicationError } from '../application/errors';
import * as FileSystem from 'expo-file-system/legacy';

// Source bytes are copied into a data URI; neither the personal asset nor its metadata is changed.
export async function convertExpoImageForFamilyShare(bytes: Uint8Array, mimeType: string) {
  let manipulator: typeof import('expo-image-manipulator');
  try { manipulator = require('expo-image-manipulator'); }
  catch { throw new ApplicationError('SHARE_IMAGE_CONVERSION_UNAVAILABLE', 'Image conversion requires an updated native installation.'); }
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  const context = manipulator.ImageManipulator.manipulate(`data:${mimeType};base64,${globalThis.btoa(binary)}`);
  let image: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  let uri: string | undefined;
  try {
    image = await context.renderAsync();
    const result = await image.saveAsync({ format: manipulator.SaveFormat.JPEG, compress: 0.9, base64: true });
    uri = result.uri;
    if (!result.base64) throw new Error('Converted image bytes unavailable');
    const decoded = globalThis.atob(result.base64);
    const output = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) output[i] = decoded.charCodeAt(i);
    return { bytes: output, mimeType: 'image/jpeg' };
  } finally {
    try {
      if (uri) await FileSystem.deleteAsync(uri, { idempotent: true });
    } finally {
      image?.release();
      context.release();
    }
  }
}
