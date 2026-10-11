import { tr } from '../i18n';
export function detailPrecisionLine(precision: string): string | null {
  if (precision === 'exact') return tr("记下了当时的时刻");
  if (precision === 'day') return tr("大约是这一天");
  if (precision === 'month') return tr("大约是那个月");
  if (precision === 'year') return tr("大约是那年");
  if (precision === 'unknown') return tr("时间未确认");
  return null;
}
