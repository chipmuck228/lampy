import { deleteSavedAlbumEdition } from '../infrastructure/album-edition-delete';
import { createPersonalEpubSnapshot, listEpubSnapshots } from '../infrastructure/album-epub-snapshots';
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/react-native';
import { Alert, AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AlbumPrintScreen from './album-print-screen';
import { AlbumEpubFailure } from '../infrastructure/album-epub-files';
import {AlbumPrintFailure} from '../application/album-print';
jest.mock('../infrastructure/album-epub-snapshots', () => ({ listEpubSnapshots: jest.fn(async () => []), discardUnfinishedEpubSnapshot: async () => {}, createPersonalEpubSnapshot: jest.fn() }));
jest.mock('../infrastructure/album-edition-delete',()=>({deleteSavedAlbumEdition:jest.fn(async()=>{})}));
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
  await fireEvent.press(view.getByText('分享电子册'));
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
 const page=await render(wrap());await fireEvent.press(page.getByRole('tab',{name:'PDF'}));await waitFor(()=>expect(page.getByText('生成PDF')).toBeTruthy());
 expect(page.queryByText('开发验收入口，正式导出尚未开放。')).toBeNull();await fireEvent.press(page.getByText('生成PDF'));
 await waitFor(()=>expect(page.getByText('请先解锁导出，或恢复已有购买。')).toBeTruthy());expect(mockShare).not.toHaveBeenCalled();
});
it('shows the finished book with its real counts before anything is bought or generated', async () => {
  formal();
  mockStatus.mockResolvedValue({ owned: false, product: { id: 'app.lampy.export', name: 'Export', price: '¥18.00' } });
  const page = await render(wrap());
  await waitFor(() => expect(page.getByText('Our days')).toBeTruthy());
  expect(page.queryByTestId('album-export-book')).toBeNull();
  await fireEvent.press(page.getByRole('tab',{name:'PDF'}));
  await fireEvent.press(page.getByText('看看纸页'));
  await waitFor(() => expect(page.getByText('PDF 预览')).toBeTruthy());
  expect(page.getByTestId('album-export-book')).toBeTruthy();
  expect(page.getAllByText('Our days').length).toBeGreaterThan(0);
  expect(page.getByText('2026年9月 — 10月')).toBeTruthy();
  expect(page.getByText('2条记录 · 1张照片')).toBeTruthy();
  expect(page.getByText('封面 · 共3页')).toBeTruthy();
  expect(mockSave).not.toHaveBeenCalled();
  expect(mockPurchase).not.toHaveBeenCalled();
});
it('a purchase unlocks binding but never starts it', async () => {
  formal();
  mockStatus.mockResolvedValueOnce({ owned: false, product: { id: 'app.lampy.export', name: 'Export', price: '¥18.00' } });
  const page = await render(wrap());await fireEvent.press(page.getByRole('tab',{name:'PDF'}));
  await waitFor(() => expect(page.getByText('解锁导出 · ¥18.00')).toBeTruthy());
  expect(page.queryByText('生成PDF')).toBeNull();
  await fireEvent.press(page.getByText('解锁导出 · ¥18.00'));
  await waitFor(() => expect(page.getByText('已解锁，可以开始导出了。')).toBeTruthy());
  expect(mockPurchase).toHaveBeenCalledTimes(1);
  expect(page.getByText('生成PDF')).toBeTruthy();
  expect(mockSave).not.toHaveBeenCalled();
});
it('binding shows the reported steps, then the new edition ready to save', async () => {
  formal();
  let finish!: (value: unknown) => void;
  mockSave.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const page = await render(wrap());await fireEvent.press(page.getByRole('tab',{name:'PDF'}));
  await waitFor(() => expect(page.getByText('生成PDF')).toBeTruthy());
  await fireEvent.press(page.getByText('生成PDF'));
  await waitFor(() => expect(page.getByTestId('album-export-binding')).toBeTruthy());
  await act(async () => mockProgress.report?.({ step: 'copy', done: 1, total: 3 }));
  expect(page.getByText('收好照片与声音 2/3')).toBeTruthy();
  await act(async () => {
    finish({ manifest: { id: 'print_9', name: 'Our days', createdAt: '2026-11-02T10:00:00.000Z', style: 'handmade', imageDpi: [], pdf: { pageCount: 3, bytes: 2048, fontRunNames: [] } } });
  });
  await waitFor(() => expect(page.getByText('PDF已生成。')).toBeTruthy());
  expect(page.getByText(/第1版/)).toBeTruthy();
  expect(mockShare).not.toHaveBeenCalled();
  expect(page.queryByTestId('album-export-fresh-share')).toBeNull();
  expect(page.getAllByText('分享或打印PDF')).toHaveLength(1);
  await fireEvent.press(page.getByText('分享或打印PDF'));
  await waitFor(() => expect(mockShare).toHaveBeenCalledTimes(1));
});
it('keeps the existing PDF paper preference without exposing it as an EPUB design', async () => {
  formal();
  mockSave.mockResolvedValue({ manifest: { id: 'print_2', name: 'Our days', createdAt: 'x', style: 'handmade', imageDpi: [], pdf: { pageCount: 3, bytes: 1, fontRunNames: [] } } });
  const page = await render(wrap());
  await waitFor(() => expect(page.getByText('已解锁导出')).toBeTruthy());
  expect(page.queryByTestId('album-export-style-plain')).toBeNull();
  expect(page.getByRole('radio',{name:'生活文集'}).props.accessibilityState.selected).toBe(true);
  await fireEvent.press(page.getByRole('tab',{name:'PDF'}));
  await fireEvent.press(page.getByText('生成PDF'));
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith('handmade'));
  expect(mockSaveStyle).not.toHaveBeenCalled();
});
it('a book with unreadable moments cannot start binding', async () => {
  formal();
  mockGenerate.mockResolvedValue(book('missing'));
  const page = await render(wrap());await fireEvent.press(page.getByRole('tab',{name:'PDF'}));
  await waitFor(() => expect(page.getByText('有内容暂时无法读取，请回到册子检查后重试。')).toBeTruthy());
  await fireEvent.press(page.getByText('生成PDF'));
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
  await fireEvent.press(view.getByText('分享电子册'));
  await waitFor(() => expect(view.getByText('正在制作电子册…')).toBeTruthy());
  await act(async () => reject(new AlbumEpubFailure('WRITE_FILE', 'ERR_FILESYSTEM_WRITE')));
  await waitFor(() => expect(view.getByText('这次未能制作电子册，请重试。原记录仍然保留。')).toBeTruthy());
  expect(view.getByTestId('album-epub-diagnostic').props.children).toBe('EPUB/WRITE_FILE/ERR_FILESYSTEM_WRITE');
  expect(view.getByText('分享电子册')).toBeTruthy();
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
  await fireEvent.press(view.getByText('分享电子册'));
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
  await waitFor(() => expect(view.getByText('制作电子册')).toBeTruthy());
  await waitFor(() => expect(view.getByText('已解锁导出')).toBeTruthy());
  await fireEvent.press(view.getByText('制作电子册'));
  await waitFor(() => expect(createPersonalEpubSnapshot).toHaveBeenCalledWith('book','literary',expect.any(Function),expect.any(Function)));
  expect(mockSave).not.toHaveBeenCalled();
  expect(mockEpub).toHaveBeenCalledWith('epub_direct',expect.any(Function),expect.any(Function));
});

it('uses the selected electronic design without changing the reading paper preference', async () => {
  process.env.EXPO_PUBLIC_ALBUM_EXPORT_ENABLED = '1';
  process.env.EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED = '1';
  process.env.EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID = 'app.lampy.export';
  (createPersonalEpubSnapshot as jest.Mock).mockResolvedValueOnce({ id:'epub_images' });
  mockEpub.mockResolvedValueOnce(undefined);
  const view=await render(wrap());
  await waitFor(()=>expect(view.getByText('已解锁导出')).toBeTruthy());
  await fireEvent.press(view.getByText('影像小册'));
  expect(view.getByRole('radio',{name:'影像小册'}).props.accessibilityState.selected).toBe(true);
  expect(view.queryByTestId('album-export-style-plain')).toBeNull();
  await fireEvent.press(view.getByText('制作电子册'));
  await waitFor(()=>expect(createPersonalEpubSnapshot).toHaveBeenCalledWith('book','imagebook',expect.any(Function),expect.any(Function)));
  expect(mockSaveStyle).not.toHaveBeenCalled();
});

it('requires confirmation, removes only the chosen edition and keeps cancelled deletion intact',async()=>{
 mockList.mockResolvedValueOnce([{id:'print_delete',name:'Saved',createdAt:'2026-11-21',style:'plain',imageDpi:[],pdf:{pageCount:1,bytes:10,fontRunNames:[]}}] as never);
 const alert=jest.spyOn(Alert,'alert');const v=await render(wrap());
 await waitFor(()=>expect(v.getByTestId('edition-row-print_delete')).toBeTruthy());
 await fireEvent.press(v.getByLabelText('成品操作'));await fireEvent.press(v.getByLabelText('删除这版成品'));
 expect(deleteSavedAlbumEdition).not.toHaveBeenCalled();expect(v.getByTestId('edition-row-print_delete')).toBeTruthy();
 const buttons=alert.mock.calls[alert.mock.calls.length-1][2]!;
 expect(buttons[0].style).toBe('cancel');
 await act(async()=>{buttons[1].onPress!();});
 await waitFor(()=>expect(v.queryByTestId('edition-row-print_delete')).toBeNull());
 expect(deleteSavedAlbumEdition).toHaveBeenCalledWith('print_delete','book',expect.any(Function));
});

it('retains the row and explains deletion failure; a stale background confirmation does nothing',async()=>{
 mockList.mockResolvedValueOnce([{id:'print_keep',name:'Keep',createdAt:'2026-11-21',style:'plain',imageDpi:[],pdf:{pageCount:1,bytes:10,fontRunNames:[]}}] as never);
 (deleteSavedAlbumEdition as jest.Mock).mockRejectedValueOnce(new Error('DISK_ERROR'));
 const alert=jest.spyOn(Alert,'alert');const v=await render(wrap());
 await waitFor(()=>expect(v.getByTestId('edition-row-print_keep')).toBeTruthy());
 await fireEvent.press(v.getByLabelText('成品操作'));await fireEvent.press(v.getByLabelText('删除这版成品'));
 await act(async()=>{alert.mock.calls[alert.mock.calls.length-1][2]![1].onPress!();});
 await waitFor(()=>expect(alert).toHaveBeenCalledWith('这版成品未能删除，请再试一次。'));
 expect(v.getByTestId('edition-row-print_keep')).toBeTruthy();
 await fireEvent.press(v.getByLabelText('成品操作'));await fireEvent.press(v.getByLabelText('删除这版成品'));
 const callback=alert.mock.calls[alert.mock.calls.length-1][2]![1].onPress!;
 AppState.currentState='background';await act(async()=>callback());
 expect(deleteSavedAlbumEdition).toHaveBeenCalledTimes(1);
});

it('keeps a published EPUB successful while Books sends the app to the background',async()=>{
 process.env.EXPO_PUBLIC_ALBUM_EXPORT_ENABLED='1';process.env.EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED='1';process.env.EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID='app.lampy.export';
 (createPersonalEpubSnapshot as jest.Mock).mockResolvedValueOnce({id:'epub_books'});
 let finish!:()=>void;
 mockEpub.mockImplementationOnce((...args:unknown[])=>{
  (args[2] as (p:{stage:string;done:number;total:number})=>void)({stage:'SHARE',done:0,total:0});
  return new Promise<undefined>(resolve=>{finish=()=>resolve(undefined);});
 });
 const view=await render(wrap());await waitFor(()=>expect(view.getByText('已解锁导出')).toBeTruthy());
 await fireEvent.press(view.getByText('制作电子册'));
 await waitFor(()=>expect(view.queryByText('取消制作电子册')).toBeNull());
 AppState.currentState='background';await act(async()=>finish());
 AppState.currentState='active';
 expect(view.queryByText('本次制作已停止，请重新开始。')).toBeNull();
 expect(view.queryByText('电子册已保存在Lampy中，可再次点击保存。')).toBeNull();
});
it('labels created editions clearly, shares by row and marks only the new creation',async()=>{
 process.env.EXPO_PUBLIC_ALBUM_EXPORT_ENABLED='1';process.env.EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED='1';process.env.EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID='app.lampy.export';
 const old={id:'epub_old',name:'旧电子册',createdAt:'2026-01-01',style:'plain',design:'imagebook'};
 const added={...old,id:'epub_new',name:'新电子册',createdAt:'2026-02-01'};
 (listEpubSnapshots as jest.Mock).mockResolvedValueOnce([old]).mockResolvedValueOnce([old,added]);
 (createPersonalEpubSnapshot as jest.Mock).mockResolvedValueOnce({id:added.id});
 const v=await render(wrap());await waitFor(()=>expect(v.getByText('已生成的电子册')).toBeTruthy());
 expect(v.queryByText('保存电子册')).toBeNull();expect(v.queryByText('刚刚生成')).toBeNull();
 await fireEvent.press(v.getByText('制作电子册'));
 await waitFor(()=>expect(v.getByText('刚刚生成')).toBeTruthy());
 expect(within(v.getByTestId('edition-open-epub_new')).getByTestId('album-export-just-created')).toBeTruthy();
 expect(within(v.getByTestId('edition-open-epub_old')).queryByTestId('album-export-just-created')).toBeNull();
 expect(v.queryByText('电子册已保存在Lampy中，可再次点击保存。')).toBeNull();
 expect(v.getAllByTestId(/^edition-open-/).map(row=>row.props.testID)).toEqual(['edition-open-epub_new','edition-open-epub_old']);
 await fireEvent.press(v.getByTestId('edition-open-epub_old'));
 await waitFor(()=>expect(mockEpub).toHaveBeenCalledWith('epub_old',expect.any(Function),expect.any(Function)));
 expect(createPersonalEpubSnapshot).toHaveBeenCalledTimes(1);
 expect(v.getByText('刚刚生成')).toBeTruthy();
});
