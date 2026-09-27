import type { ReactElement } from 'react';
import { render } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootNavBand, RootReadingLayout } from './root-nav-band';

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
  beforeEach(() => {
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
  });

  it('spreads three or four items across the available width at regular type', async () => {
    const four = await render(
      wrap(
        <RootNavBand
          here="recent"
          onOther={() => undefined}
          onLeave={() => undefined}
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
    expect(StyleSheet.flatten(four.getByTestId('home-leave').props.style)).toEqual(
      expect.objectContaining({ flexGrow: 1, flexBasis: 0, alignItems: 'center' }),
    );
    expect(StyleSheet.flatten(four.getByTestId('home-family').props.style)).toEqual(
      expect.objectContaining({ flexGrow: 1, flexBasis: 0, alignItems: 'center' }),
    );
    expect(four.queryByTestId('root-nav-grid-row-1')).toBeNull();
    await four.unmount();

    const three = await render(
      wrap(<RootNavBand here="lookback" onOther={() => undefined} onLeave={() => undefined} />),
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
      wrap(<RootNavBand here="recent" onOther={() => undefined} onLeave={() => undefined} />),
    );
    expect(StyleSheet.flatten(three.getByTestId('root-nav-band').props.style)).toEqual(
      expect.objectContaining({ flexDirection: 'row', flexWrap: 'nowrap' }),
    );
    expect(three.queryByTestId('root-nav-grid-row-1')).toBeNull();
    await three.unmount();
  });

  it('uses a 2×2 grid when four items cannot share one row, in 最近 / 回看 / 留下 / 家庭 order', async () => {
    Dimensions.set({
      window: { width: 200, height: 568, scale: 2, fontScale: 1 },
      screen: { width: 200, height: 568, scale: 2, fontScale: 1 },
    });
    const grid = await render(
      wrap(
        <RootNavBand
          here="recent"
          onOther={() => undefined}
          onLeave={() => undefined}
          onFamily={() => undefined}
        />,
      ),
    );
    expect(StyleSheet.flatten(grid.getByTestId('root-nav-band').props.style)).toEqual(
      expect.objectContaining({ flexDirection: 'column', alignItems: 'stretch' }),
    );
    expect(StyleSheet.flatten(grid.getByTestId('root-nav-grid-row-1').props.style)).toEqual(
      expect.objectContaining({ flexDirection: 'row' }),
    );
    expect(grid.getByTestId('root-nav-grid-row-1')).toContainElement(grid.getByTestId('root-nav-here-wrap'));
    expect(grid.getByTestId('root-nav-grid-row-1')).toContainElement(grid.getByTestId('home-lookback'));
    expect(grid.getByTestId('root-nav-grid-row-2')).toContainElement(grid.getByTestId('home-leave'));
    expect(grid.getByTestId('root-nav-grid-row-2')).toContainElement(grid.getByTestId('home-family'));
    expect(StyleSheet.flatten(grid.getByTestId('root-nav-here-wrap').props.style)).toEqual(
      expect.objectContaining({ minWidth: 48, minHeight: 48, flexGrow: 1, flexBasis: 0 }),
    );
    await grid.unmount();

    const lookbackGrid = await render(
      wrap(
        <RootNavBand
          here="lookback"
          onOther={() => undefined}
          onLeave={() => undefined}
          onFamily={() => undefined}
        />,
      ),
    );
    expect(lookbackGrid.getByTestId('root-nav-grid-row-1')).toContainElement(
      lookbackGrid.getByTestId('root-nav-here-wrap'),
    );
    expect(lookbackGrid.getByTestId('root-nav-grid-row-1')).toContainElement(
      lookbackGrid.getByTestId('lookback-go-recent'),
    );
    expect(lookbackGrid.getByTestId('root-nav-grid-row-2')).toContainElement(
      lookbackGrid.getByTestId('lookback-leave'),
    );
    expect(lookbackGrid.getByTestId('root-nav-grid-row-2')).toContainElement(
      lookbackGrid.getByTestId('home-family'),
    );
    await lookbackGrid.unmount();
  });

  it('stacks only when a 2×2 cell would be narrower than the enlarged label', async () => {
    Dimensions.set({
      window: { width: 200, height: 568, scale: 2, fontScale: 3.1 },
      screen: { width: 200, height: 568, scale: 2, fontScale: 3.1 },
    });
    const stacked = await render(
      wrap(
        <RootNavBand
          here="recent"
          onOther={() => undefined}
          onLeave={() => undefined}
          onFamily={() => undefined}
        />,
      ),
    );
    expect(StyleSheet.flatten(stacked.getByTestId('root-nav-band').props.style)).toEqual(
      expect.objectContaining({ flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch' }),
    );
    expect(stacked.queryByTestId('root-nav-grid-row-1')).toBeNull();
    expect(StyleSheet.flatten(stacked.getByTestId('root-nav-here-wrap').props.style)).toEqual(
      expect.objectContaining({ minWidth: 48, minHeight: 48, alignItems: 'center' }),
    );
    await stacked.unmount();
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
              onOther={() => undefined}
              onLeave={() => undefined}
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
});
