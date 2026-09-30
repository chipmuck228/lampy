import { FEELING_VOCABULARY, type FeelingView, type FeelingWord } from './feeling';

/** Low-chroma accents on paper `#F3F0E9`. Not a good/bad scale. */
export const FEELING_ACCENT: Record<FeelingWord, string> = {
  高兴: '#C4A06A',
  平静: '#6F8B86',
  感动: '#B0898C',
  疲惫: '#9A8B78',
  难过: '#7A8494',
  烦乱: '#A38472',
  说不清: '#8A8680',
};

export const FEELING_ACCENT_UNKNOWN = '#8B867C';

export function isFeelingWord(value: string): value is FeelingWord {
  return (FEELING_VOCABULARY as readonly string[]).includes(value);
}

export function feelingAccentColor(feeling: FeelingView): string {
  if (feeling.known && isFeelingWord(feeling.value)) return FEELING_ACCENT[feeling.value];
  return FEELING_ACCENT_UNKNOWN;
}
