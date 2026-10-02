import { Animated, StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { LeaveFab } from './leave-fab';
import { hairline, paperDeep, sage } from './life-page';

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
      expect.objectContaining({
        minHeight: 48,
        minWidth: 48,
        backgroundColor: paperDeep,
        borderColor: hairline,
      }),
    );
    expect(view.queryByTestId('recent-leave-fab-sheen')).toBeNull();
    expect(view.queryByTestId('recent-leave-fab-depth')).toBeNull();
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

  it('paints plus and 留下 in sage on a single fill', async () => {
    const view = await render(
      <LeaveFab
        testID="recent-leave-fab"
        onPress={() => undefined}
        available
        opacity={new Animated.Value(1)}
        shift={new Animated.Value(0)}
      />,
    );
    expect(StyleSheet.flatten(view.getByText('留下').props.style)).toEqual(
      expect.objectContaining({ color: sage }),
    );
    view.unmount();
  });
});
