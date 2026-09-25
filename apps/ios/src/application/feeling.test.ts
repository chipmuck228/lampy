import { FEELING_VOCABULARY, projectFeeling } from './feeling';

describe('feeling projection', () => {
  it('treats missing and blank emotion as unselected', () => {
    expect(projectFeeling(undefined)).toBeNull();
    expect(projectFeeling(null)).toBeNull();
    expect(projectFeeling('')).toBeNull();
    expect(projectFeeling('   ')).toBeNull();
  });

  it('maps the product vocabulary without ranking or rewriting', () => {
    expect(FEELING_VOCABULARY).toEqual(['高兴', '平静', '感动', '疲惫', '难过', '烦乱', '说不清']);
    expect(projectFeeling('平静')).toEqual({ value: '平静', label: '平静', known: true });
  });

  it('keeps an unknown stored value visible instead of dropping it', () => {
    expect(projectFeeling('喜悦')).toEqual({ value: '喜悦', label: '喜悦', known: false });
    expect(projectFeeling('  温暖  ')).toEqual({ value: '温暖', label: '温暖', known: false });
  });
});
