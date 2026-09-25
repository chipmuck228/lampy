import { FAMILY_ERROR, FamilyError } from './errors';

export const MEDIA_MAX_BYTES = 8 * 1024 * 1024;

export const MEDIA_MIME = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  audio: 'audio/mp4',
} as const;

export type SupportedMediaMime = (typeof MEDIA_MIME)[keyof typeof MEDIA_MIME];

function startsWith(bytes: Uint8Array, signature: number[]) {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

export function normalizeMediaMime(raw: string | undefined): SupportedMediaMime | '' {
  const value = (raw || '').split(';')[0].trim().toLowerCase();
  if (value === 'image/jpg' || value === MEDIA_MIME.jpeg) return MEDIA_MIME.jpeg;
  if (value === MEDIA_MIME.png) return MEDIA_MIME.png;
  if (value === 'audio/m4a' || value === 'audio/aac' || value === 'audio/x-m4a' || value === MEDIA_MIME.audio) {
    return MEDIA_MIME.audio;
  }
  return '';
}

export function assertMediaPayload(bytes: Uint8Array | undefined, declaredMime: string | undefined) {
  if (!bytes || bytes.length === 0) {
    throw new FamilyError(FAMILY_ERROR.MEDIA_CORRUPT, 'Media body is empty.');
  }
  if (bytes.length > MEDIA_MAX_BYTES) {
    throw new FamilyError(FAMILY_ERROR.MEDIA_TOO_LARGE, 'Media is larger than 8 MiB.');
  }
  const mime = normalizeMediaMime(declaredMime);
  if (!mime) {
    throw new FamilyError(FAMILY_ERROR.MEDIA_UNSUPPORTED, 'This media type is not supported.');
  }
  if (mime === MEDIA_MIME.jpeg) {
    if (!startsWith(bytes, [0xff, 0xd8, 0xff])) {
      throw new FamilyError(FAMILY_ERROR.MEDIA_CORRUPT, 'JPEG payload is incomplete or not JPEG.');
    }
    return mime;
  }
  if (mime === MEDIA_MIME.png) {
    if (!startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
      throw new FamilyError(FAMILY_ERROR.MEDIA_CORRUPT, 'PNG payload is incomplete or not PNG.');
    }
    return mime;
  }
  if (bytes.length < 12 || bytes[4] !== 0x66 || bytes[5] !== 0x74 || bytes[6] !== 0x79 || bytes[7] !== 0x70) {
    throw new FamilyError(FAMILY_ERROR.MEDIA_CORRUPT, 'Audio payload is incomplete or not MP4/M4A.');
  }
  return mime;
}

export function sha256MediaBytes(bytes: Uint8Array): string {
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
  return nodeCrypto.createHash('sha256').update(bytes).digest('hex');
}

export function fingerprintUploadMedia(sha256: string, mime: string, byteLength: number) {
  return `UploadMedia:v1:${sha256}:${mime}:${byteLength}`;
}

export function sampleJpegBytes() {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
}

export function samplePngBytes() {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
}

export function sampleAudioBytes() {
  return new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00, 0x00]);
}
