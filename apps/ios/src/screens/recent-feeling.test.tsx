import { render } from '@testing-library/react-native';

import { FEELING_ACCENT, FEELING_ACCENT_UNKNOWN } from '../application/feeling-accent';
import { RecentFeeling } from './recent-feeling';

describe('recent feeling accent', () => {
  it('hides the row when no feeling was chosen', async () => {
    const view = await render(<RecentFeeling feeling={null} testID="recent-feeling" />);
    expect(view.queryByTestId('recent-feeling')).toBeNull();
    expect(view.queryByLabelText(/当时的感受/)).toBeNull();
  });

  it('keeps the stored word and does not announce the color', async () => {
    const known = await render(
      <RecentFeeling feeling={{ value: '高兴', label: '高兴', known: true }} testID="recent-feeling" />,
    );
    expect(known.getByText('当时的感受 · 高兴')).toBeTruthy();
    expect(known.getByLabelText('当时的感受，高兴')).toBeTruthy();
    expect(known.getByTestId('recent-feeling-dot').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: FEELING_ACCENT.高兴 })]),
    );

    const unknown = await render(
      <RecentFeeling feeling={{ value: '喜悦', label: '喜悦', known: false }} testID="recent-feeling-old" />,
    );
    expect(unknown.getByText('当时的感受 · 喜悦')).toBeTruthy();
    expect(unknown.getByTestId('recent-feeling-old-dot').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: FEELING_ACCENT_UNKNOWN })]),
    );
  });
});
