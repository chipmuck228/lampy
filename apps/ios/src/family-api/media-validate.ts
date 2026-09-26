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
  return sha256MediaBytesFallback(bytes);
}

function sha256MediaBytesFallback(bytes: Uint8Array): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
    0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
    0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
    0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
    0xc67178f2,
  ];
  const rr = (value: number, shift: number) => (value >>> shift) | (value << (32 - shift));
  const length = bytes.length;
  const bitLenHi = Math.floor(length / 0x20000000);
  const bitLenLo = (length << 3) >>> 0;
  const padded = new Uint8Array(((length + 9 + 63) & ~63) >>> 0);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLenHi, false);
  view.setUint32(padded.length - 4, bitLenLo, false);
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rr(w[i - 15]!, 7) ^ rr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rr(w[i - 2]!, 17) ^ rr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((value) => value.toString(16).padStart(8, '0')).join('');
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
