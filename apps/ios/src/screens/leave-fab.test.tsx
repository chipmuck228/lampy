import { Animated, StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { LeaveFab } from './leave-fab';
import { sage } from './life-page';

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
    expect(StyleSheet.flatten(fab.props.style)).toEqual(
      expect.objectContaining({ minHeight: 48, minWidth: 48, backgroundColor: sage }),
    );
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
    const shell = view.getByTestId('lookback-leave-fab-shell', { includeHiddenElements: true });
    expect(StyleSheet.flatten(shell.props.style).opacity).toBe(0);
    expect(shell.props.pointerEvents).toBe('none');
    expect(shell.props.accessibilityElementsHidden).toBe(true);
    view.unmount();
  });

  it('keeps sheen and depth from intercepting the hit or the a11y tree', async () => {
    const view = await render(
      <LeaveFab
        testID="recent-leave-fab"
        onPress={() => undefined}
        available
        opacity={new Animated.Value(1)}
        shift={new Animated.Value(0)}
      />,
    );
    for (const id of ['recent-leave-fab-sheen', 'recent-leave-fab-depth']) {
      const layer = view.getByTestId(id, { includeHiddenElements: true });
      expect(layer.props.pointerEvents).toBe('none');
      expect(layer.props.accessible).toBe(false);
      expect(layer.props.accessibilityElementsHidden).toBe(true);
    }
    expect(StyleSheet.flatten(view.getByTestId('recent-leave-fab').props.style)).toEqual(
      expect.objectContaining({ minHeight: 48, minWidth: 48, backgroundColor: sage }),
    );
    view.unmount();
  });
});
