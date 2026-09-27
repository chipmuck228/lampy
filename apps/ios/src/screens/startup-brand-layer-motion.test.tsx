import { render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import {
  resetStartupBrandForTests,
  setBrandReadyTimeoutForTests,
  shouldShowStartupBrand,
} from '../application/startup-brand';
import { StartupBrandLayer } from './startup-brand-layer';

describe('startup brand layer motion preference', () => {
  beforeEach(() => {
    resetStartupBrandForTests();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('waits for Reduce Motion when the home is already settled', async () => {
    let finishPref: (value: boolean) => void = () => undefined;
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(
      () =>
        new Promise((resolve) => {
          finishPref = resolve;
        }),
    );
    const view = await render(<StartupBrandLayer homeSettled={false} />);
    expect(view.getByTestId('startup-brand-layer')).toBeTruthy();
    view.rerender(<StartupBrandLayer homeSettled />);
    expect(view.getByTestId('startup-brand-layer')).toBeTruthy();
    expect(shouldShowStartupBrand()).toBe(true);
    finishPref(true);
    await waitFor(() => {
      expect(view.queryByTestId('startup-brand-layer')).toBeNull();
    });
    expect(shouldShowStartupBrand()).toBe(false);
    view.unmount();
  });

  it('drops without a fade when the Reduce Motion query fails', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.reject(new Error('ax')));
    const view = await render(<StartupBrandLayer homeSettled={false} />);
    expect(view.getByTestId('startup-brand-layer')).toBeTruthy();
    view.rerender(<StartupBrandLayer homeSettled />);
    await waitFor(() => {
      expect(view.queryByTestId('startup-brand-layer')).toBeNull();
    });
    expect(shouldShowStartupBrand()).toBe(false);
    view.unmount();
  });

  it('still times out if the home is ready but Reduce Motion never returns', async () => {
    setBrandReadyTimeoutForTests(200);
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => new Promise(() => undefined));
    const view = await render(<StartupBrandLayer homeSettled={false} />);
    expect(view.getByTestId('startup-brand-layer')).toBeTruthy();
    view.rerender(<StartupBrandLayer homeSettled />);
    expect(view.getByTestId('startup-brand-layer')).toBeTruthy();
    expect(shouldShowStartupBrand()).toBe(true);
    await waitFor(() => {
      expect(view.queryByTestId('startup-brand-layer')).toBeNull();
    });
    expect(shouldShowStartupBrand()).toBe(false);
    view.unmount();
    const again = await render(<StartupBrandLayer homeSettled />);
    expect(again.queryByTestId('startup-brand-layer')).toBeNull();
    again.unmount();
  });
});
