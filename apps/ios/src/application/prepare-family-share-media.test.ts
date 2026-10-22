import { ApplicationError } from './errors';
import { prepareFamilyShareMedia } from './prepare-family-share-media';
import { sampleAudioBytes, sampleJpegBytes, samplePngBytes } from '../family-api/media-validate';
const dirty = () => new Uint8Array([255,216,255,225,0,10,69,120,105,102,0,0,1,2,...sampleJpegBytes().subarray(2)]);
it('never uploads a dirty image when native support is missing, fails or returns unchanged metadata', async () => {
  await expect(prepareFamilyShareMedia(dirty(), 'image/jpeg')).rejects.toMatchObject({code:'SHARE_IMAGE_CONVERSION_UNAVAILABLE'});
  await expect(prepareFamilyShareMedia(dirty(), 'image/jpeg', async bytes => ({bytes,mimeType:'image/jpeg'}))).rejects.toMatchObject({code:'SHARE_IMAGE_CONVERSION_FAILED'});
  await expect(prepareFamilyShareMedia(dirty(), 'image/jpeg', async () => {throw Error('decode');})).rejects.toMatchObject({code:'SHARE_IMAGE_CONVERSION_FAILED'});
});
it('converts JPEG/PNG/HEIC via copied input and never mutates personal bytes', async () => {
  for (const mime of ['image/jpeg','image/png','image/heic']) {
    const source = mime === 'image/png' ? new Uint8Array([...samplePngBytes(), 1]) : dirty(), before = new Uint8Array(source);
    const copy = await prepareFamilyShareMedia(source, mime, async bytes => {bytes.fill(0); return {bytes:sampleJpegBytes(),mimeType:'image/jpeg'};});
    expect(source).toEqual(before); expect(copy.bytes).toEqual(sampleJpegBytes());
  }
});
it('does not re-encode an already metadata-free image and leaves audio unchanged', async () => {
  const convert = jest.fn();
  const image = sampleJpegBytes(); expect((await prepareFamilyShareMedia(image,'image/jpeg',convert)).bytes).toEqual(image); expect(convert).not.toHaveBeenCalled();
  const audio = sampleAudioBytes(); expect((await prepareFamilyShareMedia(audio,'audio/mp4')).bytes).toBe(audio);
});

it('allows an original above the upload limit to become a bounded clean copy', async () => {
  const original = new Uint8Array(9 * 1024 * 1024); original.set([0,0,0,24,102,116,121,112,104,101,105,99]);
  const convert = jest.fn(async () => ({bytes:sampleJpegBytes(),mimeType:'image/jpeg'}));
  await expect(prepareFamilyShareMedia(original,'image/heic',convert)).resolves.toEqual({bytes:sampleJpegBytes(),mimeType:'image/jpeg'});
  expect(convert).toHaveBeenCalledTimes(1); expect(original[8]).toBe(104);
});
it('rejects oversized sources before native conversion and preserves bounded failure codes', async () => {
  const convert = jest.fn(async () => {throw new ApplicationError('SHARE_IMAGE_DECODE_FAILED','decode');});
  await expect(prepareFamilyShareMedia(new Uint8Array(32*1024*1024+1),'image/heic',convert)).rejects.toMatchObject({code:'SHARE_IMAGE_SOURCE_TOO_LARGE'});
  expect(convert).not.toHaveBeenCalled();
  await expect(prepareFamilyShareMedia(new Uint8Array([1]),'image/heic',convert)).rejects.toMatchObject({code:'SHARE_IMAGE_DECODE_FAILED'});
});
