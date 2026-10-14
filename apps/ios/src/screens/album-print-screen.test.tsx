import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react-native';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AlbumPrintScreen from './album-print-screen';
const mockSave = jest.fn();
const mockShare = jest.fn();
const mockLocked = { locked: false };
const mockList = jest.fn(async () => []);
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useRouter: () => ({ back: jest.fn() }),
    useLocalSearchParams: () => ({ id: 'book' }),
    useFocusEffect: (effect: () => unknown) => useEffect(effect, [effect]),
  };
});
jest.mock('./device-lock-context', () => ({
  useDeviceLock: () => ({ snapshot: mockLocked }),
}));
jest.mock('../infrastructure/album-reading-store', () => ({
  readAlbumReadingState: async () => ({ style: 'handmade', position: null }),
}));
jest.mock('../infrastructure/album-print-files', () => ({
  listSavedAlbumPrints: () => mockList(),
  createExpoAlbumPrint: () => ({ save: mockSave }),
  shareSavedAlbumPrint: mockShare,
  summarizePrint: (manifest: unknown) => manifest,
}));
function wrap() {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, bottom: 34, left: 0, right: 0 },
      }}
    >
      <AlbumPrintScreen />
    </SafeAreaProvider>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_ALBUM_PRINT_EVAL = '1';
  mockLocked.locked = false;
  AppState.currentState = 'active';
});
afterEach(async () => {
  delete process.env.EXPO_PUBLIC_ALBUM_PRINT_EVAL;
  await cleanup();
});
it('default-off route cannot expose the generation action', async () => {
  delete process.env.EXPO_PUBLIC_ALBUM_PRINT_EVAL;
  const view = await render(wrap());
  expect(view.queryByText('生成并保存测试PDF')).toBeNull();
  expect(mockList).not.toHaveBeenCalled();
});
it('generation is explicit, uses the saved style, and does not auto-share', async () => {
  mockSave.mockResolvedValue({
    manifest: {
      id: 'print_1',
      name: 'Our days',
      createdAt: 'today',
      style: 'handmade',
      imageDpi: [],
      pdf: {
        pageCount: 3,
        bytes: 1024,
        fontsEmbedded: null,
        fontRunNames: ['ActualFont'],
      },
    },
  });
  const view = await render(wrap());
  await waitFor(() => expect(mockList).toHaveBeenCalled());
  await fireEvent.press(view.getByText('生成并保存测试PDF'));
  await waitFor(() => expect(view.getByText('Our days')).toBeTruthy());
  expect(mockSave).toHaveBeenCalledWith('handmade');
  expect(mockShare).not.toHaveBeenCalled();
  expect(view.getByText('字体嵌入尚未确认')).toBeTruthy();
});
it('cancelled generation cannot surface a late saved result', async () => {
  let finish!: (value: unknown) => void;
  mockSave.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = await render(wrap());
  await waitFor(() => expect(mockList).toHaveBeenCalled());
  await fireEvent.press(view.getByText('生成并保存测试PDF'));
  await waitFor(() => expect(finish).toBeDefined());
  await fireEvent.press(view.getByText('取消'));
  await act(async () => {
    finish({ manifest: { name: 'Late edition' } });
  });
  expect(view.queryByText('Late edition')).toBeNull();
});
