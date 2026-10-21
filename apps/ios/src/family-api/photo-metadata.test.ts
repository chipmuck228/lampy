import { photoMetadataIsClean, stripPhotoMetadata } from './photo-metadata';
import { sampleJpegBytes, samplePngBytes } from './media-validate';
export function jpegMetadata(marker = 225, text = 'Exif\0\0GPS camera owner thumbnail') {
  const data = new TextEncoder().encode(text), size = data.length + 2;
  return new Uint8Array([255, marker, size >>> 8, size & 255, ...data]);
}
function crc(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = c >>> 1 ^ (c & 1 ? 0xedb88320 : 0); }
  return (c ^ 0xffffffff) >>> 0;
}
export function pngMetadata(type = 'eXIf', text = 'GPS camera owner') {
  const data = new TextEncoder().encode(text), out = new Uint8Array(12 + data.length), view = new DataView(out.buffer);
  view.setUint32(0, data.length); out.set(new TextEncoder().encode(type), 4); out.set(data, 8);
  view.setUint32(out.length - 4, crc(out.subarray(4, out.length - 4))); return out;
}
it('removes all JPEG APP/COM blocks and post-image data without touching the source or image stream', () => {
  const plain = sampleJpegBytes();
  const decorated = new Uint8Array([255, 216, ...jpegMetadata(), ...jpegMetadata(226, 'ICC metadata'), ...jpegMetadata(237, 'IPTC owner'), ...jpegMetadata(254, 'comment'), ...plain.subarray(2), ...new TextEncoder().encode('trailing GPS')]);
  const original = new Uint8Array(decorated);
  expect(photoMetadataIsClean(decorated, 'image/jpeg')).toBe(false);
  expect(stripPhotoMetadata(decorated, 'image/jpeg')).toEqual(plain);
  expect(decorated).toEqual(original); expect(photoMetadataIsClean(plain, 'image/jpeg')).toBe(true);
});
it('finds metadata after a JPEG scan, rather than stopping the check at SOS', () => {
  const plain = sampleJpegBytes();
  const decorated = new Uint8Array([...plain.subarray(0, -2), ...jpegMetadata(), 255, 217]);
  expect(stripPhotoMetadata(decorated, 'image/jpeg')).toEqual(plain);
});
it('removes PNG EXIF, compressed/international text, profiles, private chunks and trailing data', () => {
  const plain = samplePngBytes();
  const added = ['eXIf', 'tEXt', 'zTXt', 'iTXt', 'iCCP', 'vpAg'].flatMap(t => [...pngMetadata(t)]);
  const decorated = new Uint8Array([...plain.subarray(0, 33), ...added, ...plain.subarray(33), 1, 2, 3]);
  expect(stripPhotoMetadata(decorated, 'image/png')).toEqual(plain);
  expect(photoMetadataIsClean(decorated, 'image/png')).toBe(false);
  expect(photoMetadataIsClean(plain, 'image/png')).toBe(true);
});
it('fails closed on truncated containers, missing end markers, corrupt CRC and excessive dimensions', () => {
  expect(() => stripPhotoMetadata(sampleJpegBytes().subarray(0, -2), 'image/jpeg')).toThrow();
  expect(() => stripPhotoMetadata(new Uint8Array([255,216,255,225,255,255]), 'image/jpeg')).toThrow();
  const png = samplePngBytes(); png[29] ^= 1;
  expect(() => stripPhotoMetadata(png, 'image/png')).toThrow();
  expect(() => stripPhotoMetadata(new Uint8Array(8 * 1024 * 1024 + 1), 'image/png')).toThrow();
  expect(() => stripPhotoMetadata(samplePngBytes(), 'image/heic')).toThrow();
  const huge = sampleJpegBytes();
  const sof = huge.findIndex((b, i) => b === 255 && huge[i + 1] === 192);
  expect(sof).toBeGreaterThan(0);
  huge.fill(255, sof + 5, sof + 9);
  expect(() => stripPhotoMetadata(huge, 'image/jpeg')).toThrow();
});

it('rejects text masquerading as a retained fixed-size PNG color chunk', () => {
  const plain=samplePngBytes();
  const unsafe=new Uint8Array([...plain.subarray(0,33),...pngMetadata('gAMA','GPS camera location'),...plain.subarray(33)]);
  expect(() => stripPhotoMetadata(unsafe,'image/png')).toThrow();
});
