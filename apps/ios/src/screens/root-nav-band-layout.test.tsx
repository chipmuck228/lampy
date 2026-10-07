import { useEffect, type ReactElement } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import { Animated, Dimensions, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LeaveFab, LEAVE_FAB_GAP_ABOVE_NAV, leaveFabOverlayPadding, leaveFabScrollReserve } from './leave-fab';
import { LIFE_ICON_NAMES } from './life-icons';
import { NAV_BAND_HIT, pageGutter } from './life-page';
import { RootNavBand, RootReadingLayout } from './root-nav-band';

function collectTestIds(node: unknown, found: string[] = []): string[] {
  if (!node || typeof node === 'string') return found;
  const current = node as { props?: { testID?: string }; children?: unknown };
  if (typeof current.props?.testID === 'string') found.push(current.props.testID);
  const children = current.children;
  if (Array.isArray(children)) {
    for (const child of children) collectTestIds(child, found);
  } else if (children) {
    collectTestIds(children, found);
  }
  return found;
}

function bandOrder(view: { toJSON: () => unknown }) {
  return collectTestIds(view.toJSON()).filter((id) =>
    ['root-nav-here-wrap', 'home-lookback', 'lookback-go-recent', 'home-albums', 'home-family'].includes(id),
  );
}

function wrap(ui: ReactElement) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      {ui}
    </SafeAreaProvider>
  );
}

describe('root nav band layout', () => {
  function phoneWindow() {
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
  }

  beforeEach(() => {
    phoneWindow();
  });

  afterEach(() => {
    cleanup();
    phoneWindow();
  });

  it('places the leave overlay above the band with the reading gutter, not over the Home Indicator twice', async () => {
    phoneWindow();
    const view = await render(
      wrap(
        <RootReadingLayout
          scrollTestID="overlay-scroll"
          overlay={
            <LeaveFab
              testID="overlay-leave-fab"
              onPress={() => undefined}
              available
              opacity={new Animated.Value(1)}
              shift={new Animated.Value(0)}
            />
          }
          band={<Text testID="overlay-band">band</Text>}
        >
          <Text>page</Text>
        </RootReadingLayout>,
      ),
    );
    expect(view.getByTestId('overlay-band')).toBeTruthy();
    expect(StyleSheet.flatten(view.getByTestId('root-leave-overlay').props.style)).toEqual(
      expect.objectContaining({
        paddingBottom: LEAVE_FAB_GAP_ABOVE_NAV,
        paddingRight: pageGutter(390, 844),
      }),
    );
    expect(StyleSheet.flatten(view.getByTestId('overlay-leave-fab').props.style)).toEqual(
      expect.objectContaining({ minHeight: 48, minWidth: 48 }),
    );
  });
  it('spreads three or four items across the available width at regular type', async () => {
    const four = await render(
      wrap(
        <RootNavBand
          here="recent"
          onGo={() => undefined}
          onFamily={() => undefined}
        />,
      ),
    );
    expect(StyleSheet.flatten(four.getByTestId('root-nav-band').props.style)).toEqual(
      expect.objectContaining({ flexDirection: 'row', flexWrap: 'nowrap', alignSelf: 'stretch' }),
    );
    expect(StyleSheet.flatten(four.getByTestId('root-nav-here-wrap').props.style)).toEqual(
      expect.objectContaining({ flexGrow: 1, flexBasis: 0, minWidth: 48, minHeight: 48, alignItems: 'center' }),
    );
    expect(StyleSheet.flatten(four.getByTestId('home-lookback').props.style)).toEqual(
      expect.objectContaining({ flexGrow: 1, flexBasis: 0, alignItems: 'center' }),
    );
    expect(four.queryByTestId('home-leave')).toBeNull();
    expect(StyleSheet.flatten(four.getByTestId('home-family').props.style)).toEqual(
      expect.objectContaining({ flexGrow: 1, flexBasis: 0, alignItems: 'center' }),
    );
    expect(four.queryByTestId('root-nav-grid-row-1')).toBeNull();
    await four.unmount();

    const three = await render(
      wrap(<RootNavBand here="lookback" onGo={() => undefined} />),
    );
    expect(StyleSheet.flatten(three.getByTestId('root-nav-here-wrap').props.style)).toEqual(
      expect.objectContaining({ flexGrow: 1, flexBasis: 0, alignItems: 'center' }),
    );
    expect(three.queryByTestId('home-family')).toBeNull();
    await three.unmount();
  });

  it('keeps a single equal row at fontScale 1.3 when the labels still fit', async () => {
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1.3 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1.3 },
    });
    const three = await render(
      wrap(<RootNavBand here="recent" onGo={() => undefined} />),
    );
    expect(StyleSheet.flatten(three.getByTestId('root-nav-band').props.style)).toEqual(
      expect.objectContaining({ flexDirection: 'row', flexWrap: 'nowrap' }),
    );
    expect(three.queryByTestId('root-nav-grid-row-1')).toBeNull();
    await three.unmount();
  });

  it('keeps 最近 / 回看 / 家庭 on a narrow phone and never shows 留下 in the band', async () => {
    Dimensions.set({
      window: { width: 200, height: 568, scale: 2, fontScale: 1 },
      screen: { width: 200, height: 568, scale: 2, fontScale: 1 },
    });
    const grid = await render(
      wrap(
        <RootNavBand
          here="recent"
          onGo={() => undefined}
          onFamily={() => undefined}
        />,
      ),
    );
    expect(grid.getByTestId('root-nav-here-wrap')).toBeTruthy();
    expect(grid.getByTestId('home-lookback')).toBeTruthy();
    expect(grid.getByTestId('home-family')).toBeTruthy();
    expect(grid.queryByTestId('home-leave')).toBeNull();
    expect(StyleSheet.flatten(grid.getByTestId('root-nav-here-wrap').props.style)).toEqual(
      expect.objectContaining({ minWidth: 48, minHeight: 48, flexGrow: 1, flexBasis: 0 }),
    );
    await grid.unmount();

    const lookbackGrid = await render(
      wrap(
        <RootNavBand
          here="lookback"
          onGo={() => undefined}
          onFamily={() => undefined}
        />,
      ),
    );
    expect(lookbackGrid.getByTestId('root-nav-here-wrap')).toBeTruthy();
    expect(lookbackGrid.getByTestId('lookback-go-recent')).toBeTruthy();
    expect(lookbackGrid.getByTestId('home-family')).toBeTruthy();
    expect(lookbackGrid.queryByTestId('lookback-leave')).toBeNull();
    await lookbackGrid.unmount();
  });

  it('keeps a phone band in one row when the system type is extra-large', async () => {
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 3.1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 3.1 },
    });
    const row = await render(
      wrap(<RootNavBand here="recent" onGo={() => undefined} />),
    );
    expect(StyleSheet.flatten(row.getByTestId('root-nav-band').props.style)).toEqual(
      expect.objectContaining({ flexDirection: 'row', flexWrap: 'nowrap' }),
    );
    expect(StyleSheet.flatten(row.getByTestId('root-nav-here-wrap').props.style).minHeight).toBe(48);
    expect(row.getByTestId('root-nav-here').props.allowFontScaling).toBe(false);
    await row.unmount();
  });

  it('uses a 2×2 grid on a narrow window even if the system type is extra-large', async () => {
    Dimensions.set({
      window: { width: 200, height: 568, scale: 2, fontScale: 3.1 },
      screen: { width: 200, height: 568, scale: 2, fontScale: 3.1 },
    });
    const grid = await render(
      wrap(
        <RootNavBand
          here="recent"
          onGo={() => undefined}
          onFamily={() => undefined}
        />,
      ),
    );
    expect(grid.queryByTestId('home-leave')).toBeNull();
    expect(grid.getByTestId('home-family')).toBeTruthy();
    expect(StyleSheet.flatten(grid.getByTestId('root-nav-here-wrap').props.style).minHeight).toBe(48);
    await grid.unmount();
  });

  it('lets the iPad reading pane shrink beside a fixed 112pt rail', async () => {
    Dimensions.set({
      window: { width: 1024, height: 1366, scale: 2, fontScale: 1 },
      screen: { width: 1024, height: 1366, scale: 2, fontScale: 1 },
    });
    const view = await render(
      wrap(
        <RootReadingLayout
          scrollTestID="tablet-scroll"
          band={
            <RootNavBand
              here="recent"
              onGo={() => undefined}
              onFamily={() => undefined}
            />
          }
        >
          <></>
        </RootReadingLayout>,
      ),
    );
    expect(StyleSheet.flatten(view.getByTestId('root-nav-band').props.style)).toEqual(
      expect.objectContaining({ width: 112, flexShrink: 0, flexGrow: 0, flexDirection: 'column' }),
    );
    expect(StyleSheet.flatten(view.getByTestId('tablet-scroll').props.style)).toEqual(
      expect.objectContaining({ flex: 1, minWidth: 0 }),
    );
    expect(StyleSheet.flatten(view.getByTestId('tablet-scroll').props.style).width).toBeUndefined();
    await view.unmount();
  });

  it('does not restack the band when only the system type changes', async () => {
    const view = await render(
      wrap(<RootNavBand here="recent" onGo={() => undefined} />),
    );
    await act(async () => {
      view.getByTestId('root-nav-here').props.onTextLayout({
        nativeEvent: { lines: [{ width: 40, height: 20 }] },
      });
    });
    expect(StyleSheet.flatten(view.getByTestId('root-nav-here-wrap').props.style).minHeight).toBe(48);

    await act(async () => {
      Dimensions.set({
        window: { width: 390, height: 844, scale: 2, fontScale: 3.1 },
        screen: { width: 390, height: 844, scale: 2, fontScale: 3.1 },
      });
    });

    expect(StyleSheet.flatten(view.getByTestId('root-nav-here-wrap').props.style).minHeight).toBe(48);
    expect(StyleSheet.flatten(view.getByTestId('root-nav-band').props.style)).toEqual(
      expect.objectContaining({ flexDirection: 'row' }),
    );
    await view.unmount();
  });

  it('keeps the reading scroll tree mounted when metrics change', async () => {
    let mounts = 0;
    function Child() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <Text testID="reading-child">page</Text>;
    }
    const view = await render(
      wrap(
        <RootReadingLayout scrollTestID="reading-scroll" band={<Text>band</Text>}>
          <Child />
        </RootReadingLayout>,
      ),
    );
    expect(view.getByTestId('reading-scroll')).toBeTruthy();
    expect(mounts).toBe(1);
    await act(async () => {
      Dimensions.set({
        window: { width: 390, height: 844, scale: 2, fontScale: 3.1 },
        screen: { width: 390, height: 844, scale: 2, fontScale: 3.1 },
      });
    });
    expect(view.getByTestId('reading-scroll')).toBeTruthy();
    expect(view.getByTestId('reading-child')).toBeTruthy();
    expect(mounts).toBe(1);
    await view.unmount();
  });

  it('keeps 最近 / 回看 / 生活册 order on the recent root', async () => {
    const recent = await render(wrap(<RootNavBand here="recent" onGo={() => undefined} />));
    expect(bandOrder(recent)).toEqual(['root-nav-here-wrap', 'home-lookback', 'home-albums']);
    expect(recent.getByTestId('root-nav-here-wrap').props.accessible).toBe(true);
    expect(recent.getByTestId('root-nav-here-wrap').props.accessibilityRole).toBe('tab');
    expect(recent.getByTestId('root-nav-here-wrap').props.accessibilityState?.selected).toBe(true);
    expect(recent.getByTestId('home-lookback').props.accessibilityState?.selected).toBe(false);
    expect(recent.getByTestId('home-albums').props.accessibilityState?.selected).toBe(false);
    expect(StyleSheet.flatten(recent.getByTestId('root-nav-here-wrap').props.style)).toEqual(
      expect.objectContaining({ minWidth: 48, minHeight: 48 }),
    );
    expect(StyleSheet.flatten(recent.getByTestId('home-albums').props.style)).toEqual(
      expect.objectContaining({ minWidth: 48, minHeight: 48 }),
    );
  });

  it('keeps 最近 / 回看 / 生活册 order on the lookback and albums roots', async () => {
    const lookback = await render(wrap(<RootNavBand here="lookback" onGo={() => undefined} />));
    expect(bandOrder(lookback)).toEqual(['lookback-go-recent', 'root-nav-here-wrap', 'home-albums']);
    expect(lookback.getByTestId('root-nav-here-wrap').props.accessibilityState?.selected).toBe(true);
    await lookback.unmount();
    const albums = await render(wrap(<RootNavBand here="albums" onGo={() => undefined} />));
    expect(bandOrder(albums)).toEqual(['lookback-go-recent', 'home-lookback', 'root-nav-here-wrap']);
    expect(albums.getByTestId('root-nav-here-wrap').props.accessibilityState?.selected).toBe(true);
    await albums.unmount();
  });

  it('routes band presses to other roots and ignores the selected item', async () => {
    phoneWindow();
    const onGo = jest.fn();
    const recent = await render(wrap(<RootNavBand here="recent" onGo={onGo} />));
    fireEvent.press(recent.getByTestId('root-nav-here-wrap'));
    expect(onGo).not.toHaveBeenCalled();
    fireEvent.press(recent.getByTestId('home-lookback'));
    expect(onGo).toHaveBeenCalledWith('lookback');
    fireEvent.press(recent.getByTestId('home-albums'));
    expect(onGo).toHaveBeenCalledWith('albums');
    expect(recent.getByTestId('home-lookback').props.accessibilityRole).toBe('tab');
    expect(recent.getByTestId('home-albums').props.accessibilityRole).toBe('tab');
  });

  it('uses catalogued system symbols for the band icons', () => {
    expect(LIFE_ICON_NAMES.recent).toBe('line.3.horizontal');
    expect(LIFE_ICON_NAMES.lookback).toBe('book');
    expect(LIFE_ICON_NAMES.album).toBe('text.book.closed');
  });

  it('reserves FAB clearance without the nav height', () => {
    expect(leaveFabScrollReserve()).toBeGreaterThanOrEqual(LEAVE_FAB_GAP_ABOVE_NAV + 48);
    expect(leaveFabScrollReserve()).toBeLessThan(NAV_BAND_HIT + 48 + LEAVE_FAB_GAP_ABOVE_NAV);
    expect(leaveFabOverlayPadding(390, 844)).toEqual({
      paddingBottom: LEAVE_FAB_GAP_ABOVE_NAV,
      paddingRight: pageGutter(390, 844),
    });
    expect(leaveFabOverlayPadding(1024, 1366).paddingRight).toBe(pageGutter(1024, 1366));
  });

});
