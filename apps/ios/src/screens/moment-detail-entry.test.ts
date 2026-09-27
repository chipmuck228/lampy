import { detailPrecisionLine } from './moment-detail-entry';

describe('detailPrecisionLine', () => {
  it('maps stored precision without inventing a clock time', () => {
    expect(detailPrecisionLine('exact')).toBe('记下了当时的时刻');
    expect(detailPrecisionLine('day')).toBe('大约是这一天');
    expect(detailPrecisionLine('month')).toBe('大约是那个月');
    expect(detailPrecisionLine('year')).toBe('大约是那年');
    expect(detailPrecisionLine('unknown')).toBe('时间未确认');
    expect(detailPrecisionLine('other')).toBeNull();
  });
});
