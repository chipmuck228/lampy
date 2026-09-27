import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { resetStartupBrandForTests, setBrandReadyTimeoutForTests } from '../application/startup-brand';
import { StartupBrandLayer } from './startup-brand-layer';

describe('startup brand layer', () => {
  beforeEach(() => {
    resetStartupBrandForTests();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('covers the first paint and leaves after a tap', async () => {
    const view = await render(<StartupBrandLayer homeSettled={false} />);
    expect(view.getByTestId('startup-brand-layer')).toBeTruthy();
    expect(view.getByLabelText('Lampy')).toBeTruthy();
    fireEvent.press(view.getByTestId('startup-brand-skip'));
    await waitFor(() => {
      expect(view.queryByTestId('startup-brand-layer')).toBeNull();
    });
    view.unmount();
    const again = await render(<StartupBrandLayer homeSettled />);
    expect(again.queryByTestId('startup-brand-layer')).toBeNull();
    again.unmount();
  });

  it('leaves after the ready timeout without a tap and does not replay', async () => {
    setBrandReadyTimeoutForTests(200);
    const view = await render(<StartupBrandLayer homeSettled={false} />);
    await waitFor(() => {
      expect(view.queryByTestId('startup-brand-layer')).toBeNull();
    });
    view.unmount();
    const again = await render(<StartupBrandLayer homeSettled={false} />);
    expect(again.queryByTestId('startup-brand-layer')).toBeNull();
    again.unmount();
  });

  it('drops immediately under Reduce Motion once the home has settled', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const view = await render(<StartupBrandLayer homeSettled />);
    await waitFor(() => {
      expect(view.queryByTestId('startup-brand-layer')).toBeNull();
    });
  });
});
