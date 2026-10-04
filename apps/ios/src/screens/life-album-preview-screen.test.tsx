import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ALBUM_LAYOUT_VERSION } from '../application/album-layout';
import LifeAlbumPreviewScreen from './life-album-preview-screen';

const mockGenerate = jest.fn();
const mockCancel = jest.fn();
const mockPlay = jest.fn(async () => undefined);
const mockPause = jest.fn(async () => undefined);
const mockCard = jest.fn(() => ({ status: 'idle' as const, currentTimeMs: 0 }));
const mockBack = jest.fn();

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ back: mockBack, dismissTo: jest.fn(), push: jest.fn() }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(effect, [effect]);
    },
    useLocalSearchParams: () => ({ id: 'album_1' }),
  };
});

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    generateAlbumLayout: mockGenerate,
    cancelAlbumLayout: mockCancel,
  }),
}));

jest.mock('./device-lock-context', () => ({
  useDeviceLock: () => ({ snapshot: { locked: false, setting: 'off', sessionUnlocked: true } }),
}));

jest.mock('./use-recent-clip-playback', () => ({
  useRecentClipPlayback: () => ({
    play: mockPlay,
    pause: mockPause,
    card: mockCard,
  }),
}));

function wrap() {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <LifeAlbumPreviewScreen />
    </SafeAreaProvider>
  );
}

const layout = {
  albumId: 'album_1',
  layoutVersion: ALBUM_LAYOUT_VERSION,
  pageSize: { widthPt: 420, heightPt: 595 },
  margins: { topPt: 40, rightPt: 36, bottomPt: 44, leftPt: 36 },
  fonts: {
    coverName: { family: 'album-serif', sizePt: 28, lineHeightPt: 36, color: '#25231F' },
    body: { family: 'album-serif', sizePt: 17, lineHeightPt: 32, color: '#25231F' },
    date: { family: 'album-ui', sizePt: 15, lineHeightPt: 22, color: '#53604F' },
    meta: { family: 'album-ui', sizePt: 15, lineHeightPt: 22, color: '#5C5851' },
  },
  fontFaces: { serif: 'Songti SC', ui: 'PingFang SC', serifLicense: '', uiLicense: '' },
  sourceFingerprint: { name: '一些日子', opening: null, cover: { kind: 'words' as const }, entryOrder: ['m1'], moments: [] },
  albumUpdatedAt: '2026-10-04T00:00:00.000Z',
  generatedAt: '2026-10-04T00:00:00.000Z',
  unicodeUnit: 'unicode-scalar' as const,
  pages: [
    {
      index: 0,
      blocks: [
        {
          kind: 'cover-name' as const,
          albumId: 'album_1',
          text: '一些日子',
          textRange: { start: 0, end: 4, unit: 'unicode-scalar' as const },
          lines: [{ start: 0, end: 4, xPt: 36, yPt: 112, widthPt: 112, heightPt: 36 }],
          box: { xPt: 36, yPt: 112, widthPt: 348, heightPt: 36 },
        },
      ],
    },
    {
      index: 1,
      blocks: [
        {
          kind: 'audio' as const,
          momentId: 'm1',
          assetId: 'aud',
          status: 'available' as const,
          durationMs: 1200,
          text: '一段声音 · 1秒',
          box: { xPt: 36, yPt: 40, widthPt: 348, heightPt: 48 },
        },
      ],
    },
  ],
};

describe('life album preview screen', () => {
  afterEach(async () => {
    await act(async () => {
      await Promise.resolve();
    });
    cleanup();
  });

  beforeEach(() => {
    cleanup();
    mockGenerate.mockReset();
    mockCancel.mockReset();
    mockPlay.mockClear();
    mockPause.mockClear();
    mockGenerate.mockResolvedValue({ layout, media: { aud: 'file://documents/clip.m4a' }, fingerprint: layout.sourceFingerprint });
  });

  it('renders measured lines and does not autoplay audio', async () => {
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByTestId('life-album-preview-page')).toBeTruthy();
    });
    expect(view.getByText('一些日子')).toBeTruthy();
    expect(view.getByText('第1页，共2页')).toBeTruthy();
    expect(mockPlay).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-preview-next'));
    });
    expect(view.getByTestId('life-album-preview-audio-aud')).toBeTruthy();
    expect(mockPlay).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-preview-audio-aud'));
    });
    expect(mockPlay).toHaveBeenCalledWith('aud', 'file://documents/clip.m4a');
  });
});
