import { createInstance, type TOptions } from 'i18next';
import { getLocales } from 'expo-localization';
import english from './en.json';

export type AppLanguage = 'zh-Hans' | 'en';
export type CopyKey = Exclude<keyof typeof english, `${string}_one` | `${string}_other`>;

export function resolveAppLanguage(tag: string | null | undefined): AppLanguage {
  return /^zh(?:-|$)/i.test(tag ?? '') ? 'zh-Hans' : 'en';
}

// iOS applies the per-app language on launch. Do not remount navigation, drafts,
// audio or the lock provider in order to change language during an active session.
function initialLanguage(): AppLanguage {
  try { return resolveAppLanguage(getLocales()[0]?.languageTag); }
  catch { return 'en'; }
}
export const appLanguage = initialLanguage();
const chinese = Object.fromEntries(Object.keys(english).map(key => [key, key.replace(/_(one|other)$/, '').replace(/\{(\d+)\}/g, '{{$1}}')]));
const instance = createInstance();
void instance.init({
  lng: appLanguage, fallbackLng: 'en', initAsync: false,
  resources: { 'zh-Hans': { translation: chinese }, en: { translation: english } },
  keySeparator: false, nsSeparator: false, interpolation: { escapeValue: false },
});

/** Only explicit authored copy is passed here. Never notes, album names or unknown feelings. */
export function tr(key: CopyKey, values: readonly unknown[] = []): string {
  if (appLanguage === 'en') {
    if (key === '{0}月{1}日') return dateLabel(2000, Number(values[0]), Number(values[1]), false);
    if (key === '{0}年{1}月{2}日') return dateLabel(Number(values[0]), Number(values[1]), Number(values[2]));
    if (key === '{0}年{1}月') return dateLabel(Number(values[0]), Number(values[1]));
    if (key === '{0}月') return monthLabel(Number(values[0]));
    if (key === '{0}年{1}月{2}日，{3}' || key === '{0}年{1}月{2}日，{3}，{4}' || key === '{0}年{1}月{2}日，{3}，{4}，{5}') {
      return [dateLabel(Number(values[0]), Number(values[1]), Number(values[2])), ...values.slice(3)].join(', ');
    }
    if (key === '{0}年{1}月，日子未确认') return `${dateLabel(Number(values[0]), Number(values[1]))} · Day uncertain`;
    if (key === '{0}年{1}月，{2}，{3}') return [dateLabel(Number(values[0]), Number(values[1])), ...values.slice(2)].join(', ');
    if (key === '记录于 {0}月{1}日') return `Recorded ${dateLabel(2000, Number(values[0]), Number(values[1]), false)}`;
    if (key === '{0}月{1}日 · {2}') return `${dateLabel(2000, Number(values[0]), Number(values[1]), false)} · ${values[2]}`;
    if (key === '{0}月{1}日，还没到' || key === '{0}月{1}日，已选中') return `${dateLabel(2000, Number(values[0]), Number(values[1]), false)}, ${key.endsWith('还没到') ? 'in the future' : 'selected'}`;
  }
  const options: TOptions = Object.fromEntries(values.map((value, index) => [String(index), String(value ?? '')]));
  const countIndex = key === '{0}，有{1}条记录' || key === '{0} · {1}条' ? 1 : 0;
  const hasCount = ['{0}条', '{0}条记录', '有{0}条记录', '时间未确认，有{0}条记录', '{0}，有{1}条记录', '{0} · {1}条', '共{0}张'].includes(key);
  if (hasCount) options.count = Number(values[countIndex]);
  return String(instance.t(key, options));
}
export function feelingLabel(value: string): string {
  const known = ['高兴', '平静', '感动', '疲惫', '难过', '烦乱', '说不清'] as const;
  return known.includes(value as typeof known[number]) ? tr(value as CopyKey) : value;
}
export function monthLabel(month: number, short = false): string {
  if (appLanguage === 'zh-Hans') return `${month}月`;
  return new Intl.DateTimeFormat('en', { month: short ? 'short' : 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, month - 1, 1)));
}
/** Format already resolved calendar parts; never reinterpret an occurred instant in another zone. */
export function dateLabel(year: number, month: number, day?: number, includeYear = true): string {
  if (appLanguage === 'zh-Hans') return `${includeYear ? `${year}年` : ''}${month}月${day == null ? '' : `${day}日`}`;
  return `${monthLabel(month, true)}${day == null ? '' : ` ${day}`}${includeYear ? `${day == null ? ' ' : ', '}${year}` : ''}`;
}
export function weekdayLabel(mondayIndex: number, short = false): string {
  if (appLanguage === 'zh-Hans') return `${short ? '周' : '星期'}${['一','二','三','四','五','六','日'][mondayIndex]}`;
  return (short ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] : ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'])[mondayIndex] ?? '';
}
