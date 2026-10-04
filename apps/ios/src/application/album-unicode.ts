/** Unicode scalar (code point) indices, not UTF-16 units. */

export function albumCodePoints(text: string): string[] {
  return Array.from(text);
}

export function albumCodePointLength(text: string): number {
  return albumCodePoints(text).length;
}

export function albumSliceCodePoints(text: string, start: number, end: number): string {
  const points = albumCodePoints(text);
  const lo = Math.max(0, Math.min(start, points.length));
  const hi = Math.max(lo, Math.min(end, points.length));
  return points.slice(lo, hi).join('');
}

export function albumCodePointAt(text: string, index: number): string | undefined {
  return albumCodePoints(text)[index];
}
