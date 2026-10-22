// Container allow-list, not a decoder/steganography detector. Strip only AFTER
// rendering into sRGB and baking orientation. Historical originals are audit-only.
export const PHOTO_MAX_PIXELS = 40_000_000;
function invalid(): never { throw new Error('PHOTO_CONTAINER_INVALID'); }
function join(parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0; for (const part of parts) { output.set(part, at); at += part.length; }
  return output;
}
function dimensions(w: number, h: number) { if (!w || !h || w * h > PHOTO_MAX_PIXELS) invalid(); }
function jpeg(bytes: Uint8Array) {
  if (bytes[0] !== 255 || bytes[1] !== 216) invalid();
  const parts = [bytes.subarray(0, 2)]; let at = 2, frame = false, scan = false;
  while (at < bytes.length) {
    const start = at; if (bytes[at++] !== 255) invalid();
    while (bytes[at] === 255) at++;
    const marker = bytes[at++];
    if (marker === 217) {
      if (!frame || !scan) invalid();
      parts.push(new Uint8Array([255, 217])); return join(parts); // Discard post-EOI data.
    }
    if (marker === undefined || marker === 0 || marker === 216) invalid();
    const length = (bytes[at] << 8) | bytes[at + 1];
    if (at + 2 > bytes.length || length < 2 || at + length > bytes.length) invalid();
    const end = at + length;
    if (marker >= 224 && marker <= 239 || marker === 254) { at = end; continue; }
    if (![192, 193, 194, 196, 219, 221, 218].includes(marker)) invalid();
    if ([192, 193, 194].includes(marker)) {
      if (frame || length < 11 || bytes[at + 2] !== 8) invalid();
      const components = bytes[at + 7];
      if (![1, 3].includes(components) || length !== 8 + 3 * components) invalid();
      dimensions((bytes[at + 5] << 8) | bytes[at + 6], (bytes[at + 3] << 8) | bytes[at + 4]); frame = true;
    }
    if (marker === 218) {
      if (!frame || length < 6 || length !== 6 + 2 * bytes[at + 2]) invalid(); scan = true;
    }
    parts.push(bytes.subarray(start, end)); at = end;
    if (marker === 218) {
      const entropy = at;
      while (at < bytes.length) {
        if (bytes[at] !== 255) { at++; continue; }
        let next = at + 1; while (bytes[next] === 255) next++;
        const code = bytes[next];
        if (code === 0 || code >= 208 && code <= 215) { at = next + 1; continue; } break;
      }
      parts.push(bytes.subarray(entropy, at));
    }
  }
  return invalid();
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const value of bytes) { crc ^= value; for (let i = 0; i < 8; i++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(bytes: Uint8Array) {
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), parts = [bytes.subarray(0, 8)];
  let at = 8, header = false, data = false, afterData = false, chunks = 0, color = -1, palette = 0;
  const single = new Set<string>();
  const keep = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'sRGB', 'gAMA', 'cHRM']);
  while (at + 12 <= bytes.length && ++chunks <= 8192) {
    const length = view.getUint32(at), end = at + 12 + length; if (end > bytes.length) invalid();
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (!/^[A-Za-z]{4}$/.test(type) || crc32(bytes.subarray(at + 4, end - 4)) !== view.getUint32(end - 4)) invalid();
    if (!header && type !== 'IHDR') invalid();
    if (type === 'IHDR') {
      if (header || length !== 13) invalid();
      dimensions(view.getUint32(at + 8), view.getUint32(at + 12)); header = true;
      const depth = bytes[at + 16]; color = bytes[at + 17];
      const depths: Record<number, number[]> = {0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
      if (!depths[color]?.includes(depth) || bytes[at + 18] !== 0 || bytes[at + 19] !== 0 || bytes[at + 20] > 1) invalid();
    }
    if (['PLTE', 'tRNS', 'sRGB', 'gAMA', 'cHRM'].includes(type)) {
      if (data || single.has(type)) invalid(); single.add(type);
      if (type === 'PLTE') { if (!length || length > 768 || length % 3 || [0,4].includes(color)) invalid(); palette = length / 3; }
      if (type === 'tRNS' && !(color === 0 && length === 2 || color === 2 && length === 6 || color === 3 && palette > 0 && length > 0 && length <= palette)) invalid();
      if (type === 'sRGB' && (length !== 1 || bytes[at + 8] > 3)) invalid();
      if (type === 'gAMA' && (length !== 4 || view.getUint32(at + 8) === 0)) invalid();
      if (type === 'cHRM' && length !== 32) invalid();
    }
    if (type === 'IDAT' && color === 3 && !palette) invalid();
    if (type === 'IDAT') { if (afterData) invalid(); data = true; } else if (data) afterData = true;
    if (!keep.has(type) && type[0] === type[0].toUpperCase()) invalid();
    if (keep.has(type)) parts.push(bytes.subarray(at, end));
    if (type === 'IEND') { if (length !== 0 || !data) invalid(); return join(parts); }
    at = end;
  }
  return invalid();
}
export function stripPhotoMetadata(bytes: Uint8Array, mime: string): Uint8Array {
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) invalid();
  if (mime === 'image/jpeg') return jpeg(bytes);
  if (mime === 'image/png') return png(bytes);
  return invalid();
}
export function photoMetadataIsClean(bytes: Uint8Array, mime: string) {
  const clean = stripPhotoMetadata(bytes, mime);
  return clean.length === bytes.length && clean.every((v, i) => v === bytes[i]);
}
