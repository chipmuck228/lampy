import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react-native';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LifeAlbumReadingScreen from './life-album-reading-screen';

const mockRead = jest.fn();
const mockPause = jest.fn(async () => undefined);
const mockPlay = jest.fn(async () => undefined);
const mockPush = jest.fn();
const mockCancel = jest.fn();
const mockBack = jest.fn();
const mockLocked = { locked: false };
const mockRoute = { id: 'book' };
const mockSave = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useRouter: () => ({ push: mockPush, back: mockBack }),
    useLocalSearchParams: () => mockRoute,
    useFocusEffect: (effect: () => unknown) => useEffect(effect, [effect]),
  };
});
jest.mock('./device-lock-context', () => ({
  useDeviceLock: () => ({ snapshot: mockLocked }),
}));
jest.mock('./use-recent-clip-playback', () => ({
  useRecentClipPlayback: () => ({
    release: mockPause,
    pause: mockPause,
    play: mockPlay,
    card: () => ({ status: 'idle' }),
  }),
}));
jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    beginAlbumLayout: () => ({ requestId: 1 }),
    readAlbumForContinuousReading: mockRead,
    cancelAlbumLayout: mockCancel,
  }),
}));
jest.mock('../infrastructure/album-reading-store', () => ({
  readAlbumReadingState: async () => ({ style: 'plain', position: null }),
  saveAlbumReadingState: (...args: unknown[]) => mockSave(...args),
}));
const fixture = {
  album: {
    id: 'book',
    schemaVersion: 1,
    name: 'Our days',
    opening: 'Opening',
    cover: { kind: 'words' },
    entries: [],
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
  },
  entries: [
    {
      momentId: 'm1',
      collectedAt: '2026-10-01',
      sourceRevisionAtCollect: 1,
      presence: 'ready',
      revision: 1,
      note: 'Full original text\nSecond paragraph 🥣',
      feeling: '平静',
      occurredAtPrecision: 'unknown',
      recordedAt: '2026-10-01T00:00:00Z',
      media: [
        {
          assetId: 'a1',
          role: 'audio',
          availability: 'available',
          uri: 'file:///voice.m4a',
          durationMs: 8000,
          intrinsicRatio: null,
        },
      ],
    },
  ],
};
function wrap() {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, bottom: 34, left: 0, right: 0 },
      }}
    >
      <LifeAlbumReadingScreen />
    </SafeAreaProvider>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  mockLocked.locked = false;
  mockRoute.id = 'book';
  AppState.currentState = 'active';
  mockRead.mockResolvedValue({ input: fixture, requestId: 1 });
});
afterEach(cleanup);
it('reads full text, plays only by tap, and returns through a persistent header', async () => {
  const view = await render(wrap());
  await waitFor(() =>
    expect(view.getByText(fixture.entries[0].note)).toBeTruthy(),
  );
  expect(mockPlay).not.toHaveBeenCalled();
  await fireEvent.press(view.getByTestId('album-reading-audio-a1'));
  expect(mockPlay).toHaveBeenCalledWith('a1', 'file:///voice.m4a');
  await fireEvent.press(view.getByText('手作'));
  await fireEvent.press(view.getByLabelText('看纸页'));
  expect(mockSave).toHaveBeenLastCalledWith('book', 'handmade', null);
  expect(mockPush).toHaveBeenCalledWith('/albums/book/preview');
  await fireEvent.press(view.getByLabelText('返回'));
  expect(mockBack).toHaveBeenCalled();
});
it('removes title and body on lock, pauses, and rejects a delayed read result', async () => {
  const view = await render(wrap());
  await waitFor(() => expect(view.getByText('Our days')).toBeTruthy());
  mockLocked.locked = true;
  await view.rerender(wrap());
  expect(view.queryByText('Our days')).toBeNull();
  expect(view.queryByText(fixture.entries[0].note)).toBeNull();
  expect(mockPause).toHaveBeenCalled();
  mockLocked.locked = false;
  let finish!: (result: unknown) => void;
  mockRead.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await view.rerender(wrap());
  await waitFor(() => expect(finish).toBeDefined());
  mockLocked.locked = true;
  await view.rerender(wrap());
  await act(async () => {
    finish({ input: fixture, requestId: 1 });
  });
  expect(view.queryByText('Our days')).toBeNull();
});
it('saves a record anchor and hashed position after actual layout and scrolling', async () => {
  const view = await render(wrap());
  await waitFor(() => expect(view.getByText('Our days')).toBeTruthy());
  await fireEvent(view.getByTestId('album-reading-record-m1'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 450, width: 342, height: 300 } },
  });
  await fireEvent(
    view.getByTestId('life-album-reading-scroll'),
    'contentSizeChange',
    342,
    1000,
  );
  await fireEvent.scroll(view.getByTestId('life-album-reading-scroll'), {
    nativeEvent: { contentOffset: { y: 500 } },
  });
  await view.unmount();
  expect(mockSave).toHaveBeenCalledWith(
    'book',
    'plain',
    expect.objectContaining({
      anchor: 'm1',
      y: 500,
      within: 50,
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    }),
  );
});
it('a removed record is explicit and cannot expose old text or audio', async () => {
  mockRead.mockResolvedValue({
    input: {
      ...fixture,
      entries: [{ ...fixture.entries[0], presence: 'missing' }],
    },
    requestId: 1,
  });
  const view = await render(wrap());
  await waitFor(() => expect(view.getByText('这条已经不在。')).toBeTruthy());
  expect(view.queryByText(fixture.entries[0].note)).toBeNull();
  expect(view.queryByTestId('album-reading-audio-a1')).toBeNull();
});

it('external frozen reading never reads personal sources or writes reading history', async () => {
  const onClose = jest.fn();
  const view = await render(<SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,bottom:0,left:0,right:0}}}>
    <LifeAlbumReadingScreen external={{input: fixture as import('../application/album-layout-input').AlbumLayoutInput,style:'handmade',onClose}} />
  </SafeAreaProvider>);
  await waitFor(() => expect(view.getByText('Our days')).toBeTruthy());
  expect(mockRead).not.toHaveBeenCalled();
  expect(view.queryByText('看纸页')).toBeNull();expect(view.queryByText('素纸')).toBeNull();
  await fireEvent.press(view.getByText('关闭这一册'));
  await waitFor(() => expect(onClose).toHaveBeenCalled());await view.unmount();
  expect(mockSave).not.toHaveBeenCalled();
});
