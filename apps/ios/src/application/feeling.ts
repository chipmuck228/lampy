export const FEELING_VOCABULARY = [
  '高兴',
  '平静',
  '感动',
  '疲惫',
  '难过',
  '烦乱',
  '说不清',
] as const;

export type FeelingWord = (typeof FEELING_VOCABULARY)[number];

export type FeelingView = {
  value: string;
  label: string;
  known: boolean;
};

export function projectFeeling(emotion: string | undefined | null): FeelingView | null {
  if (typeof emotion !== 'string') return null;
  const value = emotion.trim();
  if (!value) return null;
  return {
    value,
    label: value,
    known: (FEELING_VOCABULARY as readonly string[]).includes(value),
  };
}
