import { Animated } from 'react-native';
import { render } from '@testing-library/react-native';

import { LeaveFab } from './leave-fab';

describe('shared LeaveFab', () => {
  it('stays operable and focusable when available', async () => {
    const view = await render(
      <LeaveFab
        testID="recent-leave-fab"
        onPress={() => undefined}
        available
        opacity={new Animated.Value(1)}
        shift={new Animated.Value(0)}
      />,
    );
    const fab = view.getByTestId('recent-leave-fab');
    expect(fab.props.accessibilityElementsHidden).toBe(false);
    expect(fab.props.accessibilityState?.disabled ?? fab.props.disabled).toBe(false);
    view.unmount();
  });

  it('cannot be pressed or focused when hidden', async () => {
    const view = await render(
      <LeaveFab
        testID="lookback-leave-fab"
        onPress={() => undefined}
        available={false}
        opacity={new Animated.Value(1)}
        shift={new Animated.Value(0)}
      />,
    );
    const fab = view.getByTestId('lookback-leave-fab', { includeHiddenElements: true });
    expect(fab.props.accessibilityElementsHidden).toBe(true);
    expect(fab.props.accessibilityState?.disabled ?? fab.props.disabled).toBe(true);
    view.unmount();
  });
});
