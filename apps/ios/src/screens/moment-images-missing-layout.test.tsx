import { render, waitFor } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import MomentDetailScreen from '../app/moment/[id]';

const HINT = '这张照片暂时找不到了，但这条记录还在。';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'moment_missing_pair' }),
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getMomentDetail: async () => ({
      kind: 'ready',
      id: 'moment_missing_pair',
      note: '字还在',
      dateLabel: '2026年9月24日',
      precision: 'day',
      usedRecordedAtFallback: false,
      sourceLabel: '你留下的记录',
      images: [
        {
          id: 'asset_ready',
          status: 'available',
          uri: 'memory://assets/asset_ready.jpg',
          width: 900,
          height: 1200,
          label: '照片 1/2',
        },
        {
          id: 'asset_gone',
          status: 'unavailable',
          width: 900,
          height: 1200,
          label: '照片 2/2',
          unavailableLabel: HINT,
        },
      ],
      audio: null,
    }),
  }),
}));

function setFontScale(fontScale: number) {
  Dimensions.set({
    window: { width: 390, height: 844, scale: 3, fontScale },
    screen: { width: 390, height: 844, scale: 3, fontScale },
  });
}

setFontScale(1);

function flatten(style: unknown): Record<string, unknown> {
  return (StyleSheet.flatten(style as object) ?? {}) as Record<string, unknown>;
}

function wrap() {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <MomentDetailScreen />
    </SafeAreaProvider>
  );
}

describe('moment detail missing portrait beside a readable one', () => {
  afterEach(() => {
    setFontScale(1);
  });

  it.each([1, 2])(
    'keeps the in-place hint fully readable at fontScale %s instead of clipping it in a pair',
    async (fontScale) => {
      setFontScale(fontScale);
      const view = await render(wrap());
      await waitFor(() => {
        expect(view.getByText('字还在')).toBeTruthy();
      });

      expect(view.queryByTestId('detail-image-band-pair')).toBeNull();
      expect(view.getByText(HINT)).toBeTruthy();
      expect(view.getByLabelText(`照片 2/2。${HINT}`)).toBeTruthy();
      expect(view.getByLabelText('照片 1/2')).toBeTruthy();

      const ready = flatten(view.getByTestId('detail-image-frame-asset_ready').props.style);
      const missing = flatten(view.getByTestId('detail-image-frame-asset_gone').props.style);
      expect(ready.aspectRatio).toBe(0.75);
      expect(ready.overflow).toBe('hidden');
      expect(missing.aspectRatio).toBeUndefined();
      expect(missing.overflow).toBe('visible');
      expect(missing.minHeight).toBe(88);

      const serialized = JSON.stringify(view.toJSON());
      expect(serialized.indexOf('detail-image-frame-asset_ready')).toBeLessThan(
        serialized.indexOf('detail-image-frame-asset_gone'),
      );
      view.unmount();
    },
  );
});
