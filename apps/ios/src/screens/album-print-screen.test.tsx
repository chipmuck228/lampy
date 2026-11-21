import { createPersonalEpubSnapshot } from '../infrastructure/album-epub-snapshots';
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
import { AlbumEpubFailure } from '../infrastructure/album-epub-files';
import {AlbumPrintFailure} from '../application/album-print';
jest.mock('../infrastructure/album-epub-snapshots', () => ({ listEpubSnapshots: async () => [], discardUnfinishedEpubSnapshot: async () => {}, createPersonalEpubSnapshot: jest.fn() }));
const mockEpub = jest.fn(async () => undefined);
jest.mock('../infrastructure/album-epub-files', () => ({
  ...jest.requireActual('../infrastructure/album-epub-files'),
  shareAlbumEpub: (...args: unknown[]) => mockEpub(...(args as [])),
}));
const mockSave = jest.fn();
const mockShare = jest.fn();
const mockLocked = { locked: false };
const mockList = jest.fn(async () => []);
const mockGenerate = jest.fn();
const mockSaveStyle = jest.fn(async () => undefined);
const mockStatus = jest.fn();
const mockPurchase = jest.fn();
const mockProgress: { report?: (update: unknown) => void } = {};
jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    beginAlbumLayout: () => ({ requestId: 1 }),
    generateAlbumLayout: () => mockGenerate(),
    cancelAlbumLayout: jest.fn(),
  }),
}));
jest.mock('../infrastructure/album-export-purchases', () => ({
  albumExportAccess: { status: () => mockStatus(), purchase: () => mockPurchase(), restore: jest.fn() },
  observeExportEntitlements: () => () => {},
}));
const box = { xPt: 36, yPt: 40, widthPt: 348, heightPt: 36 };
function book(presence: 'ready' | 'missing' = 'ready') {
  return {
    layout: {
      albumId: 'book',
      layoutVersion: 'album-a5-v5',
      pageSize: { widthPt: 419.5, heightPt: 595.3 },
      sourceFingerprint: {
        name: 'Our days',
        opening: null,
        cover: { kind: 'words' },
        entryOrder: ['m1', 'm2'],
        moments: [
          { momentId: 'm1', presence, revision: 1, media: [{ assetId: 'p1', role: 'image', availability: 'available' }] },
          { momentId: 'm2', presence: 'ready', revision: 1, media: [] },
        ],
      },
      pages: [
        { index: 0, blocks: [{ kind: 'cover-name', albumId: 'book', text: 'Our days', lines: [], box }], rendering: { serif: 'S', ui: 'U', copy: {} } },
        {
          index: 1,
          blocks: [
            { kind: 'day-rule', momentId: 'm1', dateKey: 'd:2026-9-3', text: '9月3日', box },
            { kind: 'image', momentId: 'm1', assetId: 'p1', status: 'available', intrinsicRatio: 1, box },
          ],
          rendering: { serif: 'S', ui: 'U', copy: {} },
        },
        { index: 2, blocks: [{ kind: 'day-rule', momentId: 'm2', dateKey: 'd:2026-10-20', text: '10月20日', box }], rendering: { serif: 'S', ui: 'U', copy: {} } },
      ],
    },
    media: {},
    requestId: 1,
  };
}
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
  saveAlbumReadingState: (...args: unknown[]) => mockSaveStyle(...(args as [])),
}));
jest.mock('../infrastructure/album-print-files', () => ({
  listSavedAlbumPrints: () => mockList(),
  createExpoAlbumPrint: (_id: string, _valid: unknown, progress: (update: unknown) => void) => {
    mockProgress.report = progress;
    return { save: mockSave };
  },
  shareSavedAlbumPrint: (...args: unknown[]) => mockShare(...args),
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
  mockGenerate.mockResolvedValue(book());
  mockStatus.mockResolvedValue({ owned: true, product: { id: 'app.lampy.export', name: 'Export', price: '¥18.00' } });
  mockPurchase.mockResolvedValue({ status: 'purchased' });
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
      name: 'Saved edition',
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
  await waitFor(() => expect(view.getByText('Saved edition')).toBeTruthy());
  expect(mockSave).toHaveBeenCalledWith('handmade');
  expect(mockShare).not.toHaveBeenCalled();
  expect(mockEpub).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText('保存电子册 EPUB'));
  await waitFor(() => expect(mockEpub).toHaveBeenCalledWith('print_1', expect.any(Function), expect.any(Function)));
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

function formal() {
  process.env.EXPO_PUBLIC_ALBUM_EXPORT_ENABLED = '1';
  process.env.EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED = '1';
  process.env.EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID = 'app.lampy.export';
  delete process.env.EXPO_PUBLIC_ALBUM_PRINT_EVAL;
}
it('exposes the formal PDF entry only under its switch and surfaces the protected entitlement denial',async()=>{
 formal();
 mockSave.mockRejectedValueOnce(new AlbumPrintFailure({stage:'AUTHORIZE_EXPORT',code:'EXPORT_PURCHASE_REQUIRED'}));
 const page=await render(wrap());await waitFor(()=>expect(page.getByText('装订成册')).toBeTruthy());
 expect(page.queryByText('开发验收入口，正式导出尚未开放。')).toBeNull();await fireEvent.press(page.getByText('装订成册'));
 await waitFor(()=>expect(page.getByText('请先解锁或恢复导出权益，再装订这一册。')).toBeTruthy());expect(mockShare).not.toHaveBeenCalled();
});
it('shows the finished book with its real counts before anything is bought or generated', async () => {
  formal();
  mockStatus.mockResolvedValue({ owned: false, product: { id: 'app.lampy.export', name: 'Export', price: '¥18.00' } });
  const page = await render(wrap());
  await waitFor(() => expect(page.getByText('翻一翻，这就是导出后的样子。')).toBeTruthy());
  expect(page.getByTestId('album-export-book')).toBeTruthy();
  expect(page.getAllByText('Our days').length).toBeGreaterThan(0);
  expect(page.getByText('2026年9月 — 10月 · A5 · 148×210 mm')).toBeTruthy();
  expect(page.getByLabelText('3页，2条记录，1张照片')).toBeTruthy();
  expect(page.getByText('封面 · 共3页')).toBeTruthy();
  expect(mockSave).not.toHaveBeenCalled();
  expect(mockPurchase).not.toHaveBeenCalled();
});
it('a purchase unlocks binding but never starts it', async () => {
  formal();
  mockStatus.mockResolvedValueOnce({ owned: false, product: { id: 'app.lampy.export', name: 'Export', price: '¥18.00' } });
  const page = await render(wrap());
  await waitFor(() => expect(page.getByText('解锁导出 · ¥18.00')).toBeTruthy());
  expect(page.queryByText('装订成册')).toBeNull();
  await fireEvent.press(page.getByText('解锁导出 · ¥18.00'));
  await waitFor(() => expect(page.getByText('已解锁。现在可以装订这一册了。')).toBeTruthy());
  expect(mockPurchase).toHaveBeenCalledTimes(1);
  expect(page.getByText('装订成册')).toBeTruthy();
  expect(mockSave).not.toHaveBeenCalled();
});
it('binding shows the reported steps, then the new edition ready to save', async () => {
  formal();
  let finish!: (value: unknown) => void;
  mockSave.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const page = await render(wrap());
  await waitFor(() => expect(page.getByText('装订成册')).toBeTruthy());
  await fireEvent.press(page.getByText('装订成册'));
  await waitFor(() => expect(page.getByTestId('album-export-binding')).toBeTruthy());
  await act(async () => mockProgress.report?.({ step: 'copy', done: 1, total: 3 }));
  expect(page.getByText('收好照片与声音 2/3')).toBeTruthy();
  await act(async () => {
    finish({ manifest: { id: 'print_9', name: 'Our days', createdAt: '2026-11-02T10:00:00.000Z', style: 'handmade', imageDpi: [], pdf: { pageCount: 3, bytes: 2048, fontRunNames: [] } } });
  });
  await waitFor(() => expect(page.getByText('这一册装订好了。')).toBeTruthy());
  expect(page.getByText('第1版 · 3页 · 2 KB')).toBeTruthy();
  expect(mockShare).not.toHaveBeenCalled();
  await waitFor(() => expect(page.getByTestId('album-export-fresh-share').props.accessibilityState.disabled).toBe(false));
  await fireEvent.press(page.getByTestId('album-export-fresh-share'));
  await waitFor(() => expect(mockShare).toHaveBeenCalledTimes(1));
});
it('choosing paper keeps the reading preference and binds with that paper', async () => {
  formal();
  mockSave.mockResolvedValue({ manifest: { id: 'print_2', name: 'Our days', createdAt: 'x', style: 'plain', imageDpi: [], pdf: { pageCount: 3, bytes: 1, fontRunNames: [] } } });
  const page = await render(wrap());
  await waitFor(() => expect(page.getByTestId('album-export-style-plain')).toBeTruthy());
  await fireEvent.press(page.getByTestId('album-export-style-plain'));
  expect(mockSaveStyle).toHaveBeenCalledWith('book', 'plain', null);
  await fireEvent.press(page.getByText('装订成册'));
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith('plain'));
});
it('a book with unreadable moments cannot start binding', async () => {
  formal();
  mockGenerate.mockResolvedValue(book('missing'));
  const page = await render(wrap());
  await waitFor(() => expect(page.getByText('这一册里有读不到的记录或媒体。核对后才能装订。')).toBeTruthy());
  await fireEvent.press(page.getByText('装订成册'));
  expect(mockSave).not.toHaveBeenCalled();
});
it('a locked device shows no book, counts or price', async () => {
  formal();
  mockLocked.locked = true;
  const page = await render(wrap());
  await act(async () => undefined);
  expect(page.queryByTestId('album-export-book')).toBeNull();
  expect(page.queryByText('Our days')).toBeNull();
  expect(page.queryByText(/解锁导出/)).toBeNull();
  expect(mockGenerate).not.toHaveBeenCalled();
});

it('shows EPUB progress and an actionable failure beside the saved edition', async () => {
  mockSave.mockResolvedValueOnce({ manifest: { id: 'print_failure', name: 'Saved for EPUB', createdAt: '2026-11-21T00:00:00Z', style: 'plain', imageDpi: [], pdf: { pageCount: 1, bytes: 1000, fontsEmbedded: true, fontRunNames: [] } } });
  let reject!: (reason: unknown) => void;
  mockEpub.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  const view = await render(wrap());
  await waitFor(() => expect(mockList).toHaveBeenCalled());
  await fireEvent.press(view.getByText('生成并保存测试PDF'));
  await waitFor(() => expect(view.getByText('Saved for EPUB')).toBeTruthy());
  await fireEvent.press(view.getByText('保存电子册 EPUB'));
  await waitFor(() => expect(view.getByText('正在制作电子册…')).toBeTruthy());
  await act(async () => reject(new AlbumEpubFailure('WRITE_FILE', 'ERR_FILESYSTEM_WRITE')));
  await waitFor(() => expect(view.getByText('电子册尚未完成，请再试一次。已有PDF和原记录不受影响。')).toBeTruthy());
  expect(view.getByTestId('album-epub-diagnostic').props.children).toBe('EPUB/WRITE_FILE/ERR_FILESYSTEM_WRITE');
  expect(view.getByText('保存电子册 EPUB')).toBeTruthy();
});

it.each(['cancel', 'leave', 'background'])('invalidates an in-flight EPUB on %s and suppresses its late result', async scenario => {
  mockSave.mockResolvedValueOnce({ manifest: { id: 'print_stop', name: 'Stop test', createdAt: '2026-11-21T00:00:00Z', style: 'plain', imageDpi: [], pdf: { pageCount: 1, bytes: 1000, fontsEmbedded: true, fontRunNames: [] } } });
  let validity: (() => boolean) | undefined;
  let finish!: () => void;
  mockEpub.mockImplementationOnce((...args: unknown[]) => { validity = args[1] as () => boolean; return new Promise<undefined>(resolve => { finish = () => resolve(undefined); }); });
  const view = await render(wrap());
  await waitFor(() => expect(mockList).toHaveBeenCalled());
  await fireEvent.press(view.getByText('生成并保存测试PDF'));
  await waitFor(() => expect(view.getByText('Stop test')).toBeTruthy());
  await fireEvent.press(view.getByText('保存电子册 EPUB'));
  await waitFor(() => expect(validity).toBeDefined());
  expect(validity!()).toBe(true);
  if (scenario === 'cancel') await fireEvent.press(view.getByText('取消制作电子册'));
  else if (scenario === 'leave') await cleanup();
  else AppState.currentState = 'background';
  expect(validity!()).toBe(false);
  await act(async () => finish());
  if (scenario !== 'leave') expect(view.queryByText('电子册已交给所选应用。')).toBeNull();
});

it('creates an independent EPUB without first generating a PDF', async () => {
  process.env.EXPO_PUBLIC_ALBUM_EXPORT_ENABLED = '1';
  process.env.EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED = '1';
  process.env.EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID = 'app.lampy.export';
  (createPersonalEpubSnapshot as jest.Mock).mockResolvedValueOnce({ id:'epub_direct' });
  mockEpub.mockResolvedValueOnce(undefined);
  const view = await render(wrap());
  await waitFor(() => expect(view.getByText('制作电子册（含声音）')).toBeTruthy());
  await waitFor(() => expect(view.getByText('已解锁导出')).toBeTruthy());
  await fireEvent.press(view.getByText('制作电子册（含声音）'));
  await waitFor(() => expect(createPersonalEpubSnapshot).toHaveBeenCalledWith('book','handmade',expect.any(Function),expect.any(Function)));
  expect(mockSave).not.toHaveBeenCalled();
  expect(mockEpub).toHaveBeenCalledWith('epub_direct',expect.any(Function),expect.any(Function));
});
