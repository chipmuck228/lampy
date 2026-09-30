import { projectFeeling } from './feeling';
import { FEELING_ACCENT, FEELING_ACCENT_UNKNOWN, feelingAccentColor } from './feeling-accent';

describe('feeling accent', () => {
  it('maps the seven words without ranking and keeps unknown storage text', () => {
    expect(feelingAccentColor(projectFeeling('高兴')!)).toBe(FEELING_ACCENT.高兴);
    expect(feelingAccentColor(projectFeeling('难过')!)).toBe(FEELING_ACCENT.难过);
    const unknown = projectFeeling('喜悦')!;
    expect(unknown).toEqual({ value: '喜悦', label: '喜悦', known: false });
    expect(feelingAccentColor(unknown)).toBe(FEELING_ACCENT_UNKNOWN);
  });
});
