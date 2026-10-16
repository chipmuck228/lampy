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
import {AlbumPrintFailure} from '../application/album-print';
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
  delete process.env.EXPO_PUBLIC_ALBUM_EXPORT_ENABLED;
  delete process.env.EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED;
  delete process.env.EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID;
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
        emojiVisualCheckRequired: true,
        textSelectable: false,
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
  expect(view.getByText('普通文字选择已核对；请打开PDF核对emoji显示，emoji可能无法复制。')).toBeTruthy();
  expect(view.queryByText('页面与文字选择已核对')).toBeNull();
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

it('failed generation exposes only the safe diagnostic stage and code', async () => {
  mockSave.mockRejectedValueOnce(new Error('PDF_REOPEN_FAILED'));
  const view = await render(wrap());
  await waitFor(() => expect(mockList).toHaveBeenCalled());
  await fireEvent.press(view.getByText('生成并保存测试PDF'));
  await waitFor(() =>
    expect(view.getByTestId('album-print-failure-diagnostic')).toBeTruthy(),
  );
  expect(
    view.getByTestId('album-print-failure-diagnostic').props.children,
  ).toBe('UNKNOWN / PDF_REOPEN_FAILED');
});

it('exposes the formal PDF entry only under its switch and surfaces the protected entitlement denial',async()=>{
 process.env.EXPO_PUBLIC_ALBUM_EXPORT_ENABLED='1';process.env.EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED='1';process.env.EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID='app.lampy.export';delete process.env.EXPO_PUBLIC_ALBUM_PRINT_EVAL;
 mockSave.mockRejectedValueOnce(new AlbumPrintFailure({stage:'AUTHORIZE_EXPORT',code:'EXPORT_PURCHASE_REQUIRED'}));
 const page=await render(wrap());await waitFor(()=>expect(mockList).toHaveBeenCalled());
 expect(page.queryByText('开发验收入口，正式导出尚未开放。')).toBeNull();await fireEvent.press(page.getByText('生成PDF'));
 await waitFor(()=>expect(page.getByText('请先解锁或恢复导出权益，再点生成PDF。')).toBeTruthy());expect(mockShare).not.toHaveBeenCalled();
});
