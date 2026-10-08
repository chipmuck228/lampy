import english from './en.json';

function localized(tag: string | null, fail = false) {
  let result!: typeof import('./index');
  jest.isolateModules(() => {
    jest.doMock('expo-localization', () => ({ getLocales: () => { if (fail) throw Error('unavailable'); return tag ? [{ languageTag: tag }] : []; } }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    result = require('./index');
  });
  return result;
}

describe('personal UI languages', () => {
  it('selects Chinese or English without changing stored values', () => {
    const en = localized('en-GB');
    expect(en.appLanguage).toBe('en');
    expect(en.resolveAppLanguage('zh-Hans-CN')).toBe('zh-Hans');
    expect(en.resolveAppLanguage('zh-Hant-TW')).toBe('zh-Hans');
    expect(en.resolveAppLanguage('fr-FR')).toBe('en');
    expect(en.tr('回看')).toBe('Revisit');
    expect(en.feelingLabel('平静')).toBe('Calm');
    expect(en.feelingLabel('我的旧词')).toBe('我的旧词');
    expect(en.feelingLabel('Calm')).toBe('Calm');
  });
  it('formats singular and plural counts and keeps Chinese copy unchanged', () => {
    const en = localized('en-US');
    expect(en.tr('{0}条记录', [1])).toBe('1 moment');
    expect(en.tr('{0}条记录', [2])).toBe('2 moments');
    expect(en.tr('共{0}张', [1])).toBe('1 photo');
    expect(en.tr('{0} · {1}条', ['Mon', 1])).toBe('Mon · 1 moment');
    const zh = localized('zh-CN');
    expect(zh.tr('{0}条记录', [1])).toBe('1条记录');
    expect(zh.tr('{0}条记录', [2])).toBe('2条记录');
    expect(zh.tr('当时的感受，{0}', ['平静'])).toBe('当时的感受，平静');
  });
  it('formats resolved date parts rather than shifting them by device timezone', () => {
    const en = localized('en');
    expect(en.dateLabel(2026, 9, 18)).toBe('Sep 18, 2026');
    expect(en.tr('{0}月{1}日', [9, 18])).toBe('Sep 18');
    expect(en.monthLabel(9)).toBe('September');
    expect(en.weekdayLabel(4)).toBe('Friday');
    expect(en.tr('{0}年{1}月，日子未确认', [2026, 9])).toBe('Sep 2026 · Day uncertain');
  });
  it('has placeholders matching the Chinese resource and falls back without waiting', () => {
    const failed = localized(null, true);
    expect(failed.tr('留下')).toBe('Capture');
    for (const [key, value] of Object.entries(english)) {
      const source = key.replace(/_(one|other)$/, '');
      const expected = [...source.matchAll(/\{(\d+)\}/g)].map(x => x[1]).sort();
      const actual = [...value.matchAll(/\{\{(\d+)\}\}/g)].map(x => x[1]).sort();
      expect(actual).toEqual(expected);
    }
  });
});


it.each([
  ['en-US', ['Continue', 'Continue', 'Capture a moment']],
  ['zh-CN', ['继续', '继续', '留下瞬间']],
])('localizes all onboarding action labels for %s', (tag, expected) => {
  jest.isolateModules(() => {
    jest.doMock('expo-localization', () => ({ getLocales: () => [{ languageTag: tag }] }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FIRST_RUN_SCREENS } = require('../application/first-run');
    expect(FIRST_RUN_SCREENS.map((screen: { action: string }) => screen.action)).toEqual(expected);
  });
});
