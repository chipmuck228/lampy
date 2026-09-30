import { render } from '@testing-library/react-native';

import { FirstRunScene } from './first-run-scene';

describe('first-run scenes', () => {
  it('marks sample composition as illustration, not personal records', async () => {
    const leave = await render(<FirstRunScene id="leave" />);
    expect(leave.getByTestId('first-run-scene-leave')).toBeTruthy();
    expect(leave.getAllByText('示意，不是你的记录').length).toBeGreaterThan(0);
    const lookback = await render(<FirstRunScene id="lookback" />);
    expect(lookback.getByTestId('first-run-scene-lookback')).toBeTruthy();
    expect(lookback.getByText('9月18日', { includeHiddenElements: true })).toBeTruthy();
    expect((await render(<FirstRunScene id="keep" />)).getByTestId('first-run-scene-keep')).toBeTruthy();
  });
});
