export function epubAudioFormat(bytes: Uint8Array) {
  if (bytes.length > 12 && String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp') return { mime: 'audio/mp4', extension: 'm4a' };
  if (String.fromCharCode(...bytes.slice(0, 3)) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 6) !== 0)) return { mime: 'audio/mpeg', extension: 'mp3' };
  throw new Error('EPUB_UNSUPPORTED_AUDIO');
}
