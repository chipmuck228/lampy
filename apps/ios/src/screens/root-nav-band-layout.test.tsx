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

  it('spreads three or four items across the available width, and stacks on purpose when a column would be under 48', async () => {
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
    await four.unmount();

    const three = await render(
      wrap(<RootNavBand here="lookback" onOther={() => undefined} onLeave={() => undefined} />),
    );
    expect(StyleSheet.flatten(three.getByTestId('root-nav-here-wrap').props.style)).toEqual(
      expect.objectContaining({ flexGrow: 1, flexBasis: 0, alignItems: 'center' }),
    );
    expect(three.queryByTestId('home-family')).toBeNull();
    await three.unmount();

    Dimensions.set({
      window: { width: 200, height: 568, scale: 2, fontScale: 1 },
      screen: { width: 200, height: 568, scale: 2, fontScale: 1 },
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
