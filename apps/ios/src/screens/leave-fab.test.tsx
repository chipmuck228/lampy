import { Animated, StyleSheet } from 'react-native';
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';

import { LeaveFab } from './leave-fab';
import { hairline, paperDeep, sage } from './life-page';

describe('shared LeaveFab', () => {
  afterEach(() => {
    cleanup();
  });
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
    expect(shell.props.pointerEvents).toBe('none');
    expect(shell.props.accessibilityElementsHidden).toBe(true);
    view.unmount();
  });

  it('does not stack a static opacity 0 on the animated shell', async () => {
    const view = await render(
      <LeaveFab
        testID="lookback-leave-fab"
        onPress={() => undefined}
        available={false}
        opacity={new Animated.Value(1)}
        shift={new Animated.Value(0)}
      />,
    );
    const shell = view.getByTestId('lookback-leave-fab-shell', { includeHiddenElements: true });
    const layers = (Array.isArray(shell.props.style) ? shell.props.style : [shell.props.style]).filter(Boolean);
    const opacityLayers = layers.filter(
      (layer): layer is { opacity: unknown } =>
        !!layer && typeof layer === 'object' && 'opacity' in layer,
    );
    expect(opacityLayers).toHaveLength(1);
    expect(opacityLayers[0].opacity).not.toBe(0);
    view.unmount();
  });

  it('force-hides immediately without writing opacity onto the scroll shell', async () => {
    const opacity = new Animated.Value(1);
    const shift = new Animated.Value(0);
    const hidden = await render(
      <LeaveFab
        testID="lookback-leave-fab"
        onPress={() => undefined}
        available
        forcedHidden
        opacity={opacity}
        shift={shift}
      />,
    );
    const force = hidden.getByTestId('lookback-leave-fab-force', { includeHiddenElements: true });
    expect(StyleSheet.flatten(force.props.style)).toEqual(expect.objectContaining({ opacity: 0 }));
    const fab = hidden.getByTestId('lookback-leave-fab', { includeHiddenElements: true });
    expect(fab.props.accessibilityElementsHidden).toBe(true);
    expect(fab.props.accessibilityState?.disabled ?? fab.props.disabled).toBe(true);
    const shell = hidden.getByTestId('lookback-leave-fab-shell', { includeHiddenElements: true });
    const layers = (Array.isArray(shell.props.style) ? shell.props.style : [shell.props.style]).filter(Boolean);
    const opacityLayers = layers.filter(
      (layer): layer is { opacity: unknown } =>
        !!layer && typeof layer === 'object' && 'opacity' in layer,
    );
    expect(opacityLayers).toHaveLength(1);
    expect(opacityLayers[0].opacity).not.toBe(0);
    hidden.unmount();
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


describe('LeaveFab voice gesture', () => {
  it('long press suppresses tap, while a new short tap stays unchanged', async () => {
    const tap = jest.fn(); const voice = jest.fn();
    const view = await render(<LeaveFab testID="fab" onPress={tap} onRecordVoice={voice}
      available opacity={new Animated.Value(1)} shift={new Animated.Value(0)} />);
    await act(async () => {
      fireEvent(view.getByTestId('fab'), 'pressIn');
      fireEvent(view.getByTestId('fab'), 'longPress');
      fireEvent.press(view.getByTestId('fab'));
    });
    expect(voice).toHaveBeenCalledTimes(1); expect(tap).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent(view.getByTestId('fab'), 'pressIn');
      fireEvent.press(view.getByTestId('fab'));
      fireEvent(view.getByTestId('fab'), 'accessibilityAction', { nativeEvent: { actionName: 'recordVoice' } });
    });
    expect(tap).toHaveBeenCalledTimes(1); expect(voice).toHaveBeenCalledTimes(2);
  });
  it('does not authorize voice while the catalog force-hides the button', async () => {
    const voice = jest.fn();
    const view = await render(<LeaveFab testID="fab" onPress={() => {}} onRecordVoice={voice}
      available forcedHidden opacity={new Animated.Value(1)} shift={new Animated.Value(0)} />);
    const fab = view.getByTestId('fab', { includeHiddenElements: true });
    await act(async () => {
      fireEvent(fab, 'longPress');
      fireEvent(fab, 'accessibilityAction', { nativeEvent: { actionName: 'recordVoice' } });
    });
    expect(voice).not.toHaveBeenCalled();
  });
});
