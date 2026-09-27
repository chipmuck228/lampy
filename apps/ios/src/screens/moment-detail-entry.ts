export function detailPrecisionLine(precision: string): string | null {
  if (precision === 'exact') return '记下了当时的时刻';
  if (precision === 'day') return '大约是这一天';
  if (precision === 'month') return '大约是那个月';
  if (precision === 'year') return '大约是那年';
  if (precision === 'unknown') return '时间未确认';
  return null;
}
