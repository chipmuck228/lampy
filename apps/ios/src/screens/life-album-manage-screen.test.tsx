import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {Alert} from 'react-native';
import LifeAlbumManageScreen from './life-album-manage-screen';

const mockPush = jest.fn();
const mockGetAlbum = jest.fn();
const mockUpdate = jest.fn();
const mockSetCover = jest.fn();
const mockMove = jest.fn();
const mockWithdraw = jest.fn();
const mockDelete = jest.fn();

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({
      dismissTo: jest.fn(),
      push: mockPush,
    }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(effect, [effect]);
    },
    useLocalSearchParams: () => ({ id: 'album_1' }),
  };
});

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getAlbum: mockGetAlbum,
    updateAlbum: mockUpdate,
    setAlbumCover: mockSetCover,
    moveAlbumEntry: mockMove,
    withdrawAlbumEntry: mockWithdraw,
    deleteAlbum: mockDelete,
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
      <LifeAlbumManageScreen />
    </SafeAreaProvider>
  );
}

function manageView() {
  return {
    album: {
      id: 'album_1',
      name: '一些日子',
      opening: null,
      cover: { kind: 'words' as const },
      entries: [
        { momentId: 'm1', collectedAt: '2026-10-03T00:00:00.000Z', sourceRevisionAtCollect: 1 },
      ],
      createdAt: '2026-10-03T00:00:00.000Z',
      updatedAt: '2026-10-03T00:00:00.000Z',
      schemaVersion: 1,
    },
    entries: [
      {
        momentId: 'm1',
        collectedAt: '2026-10-03T00:00:00.000Z',
        sourceRevisionAtCollect: 1,
        source: 'ready' as const,
        noteExcerpt: '门口的风',
        dateLabel: '2026年10月1日',
        mediaHint: '有照片',
        photoCount: 1,
        hasAudio: false,
        unknownCount: 0,
        audioDurationMs: null,
        thumbnailUri: 'file://photo.jpg',
        occurredSortKey: Date.parse('2026-10-01T00:00:00.000Z'),
      },
    ],
    coverCandidates: [
      {
        momentId: 'm1',
        assetId: 'asset_missing',
        available: false,
      },
    ],
  };
}

describe('life album overview',()=>{
 beforeEach(async()=>{
  await cleanup();jest.clearAllMocks();
  mockGetAlbum.mockResolvedValue(manageView());
  mockUpdate.mockResolvedValue({...manageView(),album:{...manageView().album,name:'改过的名字'}});
  mockSetCover.mockResolvedValue(manageView());mockMove.mockResolvedValue(manageView());mockWithdraw.mockResolvedValue(manageView());
 });
 afterEach(async()=>{await cleanup();jest.restoreAllMocks();});
 async function open(){const page=await render(wrap());await waitFor(()=>expect(page.getByText('门口的风')).toBeTruthy());return page;}
 async function menu(page:Awaited<ReturnType<typeof open>>){await fireEvent.press(page.getByTestId('life-album-manage-menu'));}
 it('shows one album name, quiet metadata and only two primary actions',async()=>{
  const page=await open();
  expect(page.getAllByText('一些日子')).toHaveLength(1);
  expect(page.getByTestId('life-album-date-range').props.children).toBe('2026年10月1日');
  expect(page.getByText('1条')).toBeTruthy();
  expect(page.getByTestId('life-album-preview-open')).toBeTruthy();
  expect(page.getByTestId('life-album-export-open')).toBeTruthy();
  expect(page.queryByTestId('life-album-edit')).toBeNull();
  expect(page.queryByTestId('life-album-organize')).toBeNull();
  expect(page.queryByTestId('life-album-delete')).toBeNull();
  expect(page.queryByTestId('life-album-move-up-m1')).toBeNull();
  expect(page.getByTestId('life-album-entry-note-m1').props.numberOfLines).toBe(2);
 });
 it('opens free EPUB reading directly and leaves save/share behind the existing export gate',async()=>{
  const page=await open();
  await fireEvent.press(page.getByTestId('life-album-preview-open'));
  expect(mockPush).toHaveBeenCalledWith('/albums/album_1/preview');
  await fireEvent.press(page.getByTestId('life-album-export-open'));
  expect(mockPush).toHaveBeenCalledWith('/albums/album_1/print');
  await fireEvent.press(page.getByTestId('life-album-entry-open-m1'));
  expect(mockPush).toHaveBeenCalledWith({pathname:'/moment/[id]',params:{id:'m1'}});
 });
 it('collects management and continuous reading under one menu',async()=>{
  const page=await open();await menu(page);
  for(const id of ['life-album-edit','life-album-organize','life-album-delete','life-album-continuous-open'])expect(page.getByTestId(id)).toBeTruthy();
  await fireEvent.press(page.getByTestId('life-album-continuous-open'));
  expect(mockPush).toHaveBeenCalledWith('/albums/album_1/read');
  expect(page.queryByTestId('life-album-menu')).toBeNull();
 });
 it('keeps an unsaved opening through cover and name saves, then explicitly cancels editing',async()=>{
  const page=await open();await menu(page);await fireEvent.press(page.getByTestId('life-album-edit'));
  expect(page.queryByTestId('life-album-contents')).toBeNull();
  expect(page.queryByTestId('life-album-organize')).toBeNull();
  await fireEvent.changeText(page.getByTestId('life-album-manage-opening'),'暂未保存的开篇');
  await fireEvent.press(page.getByTestId('life-album-cover-asset_missing'));
  expect(mockSetCover).not.toHaveBeenCalled();
  await fireEvent.press(page.getByTestId('life-album-cover-words'));
  await waitFor(()=>expect(mockSetCover).toHaveBeenCalled());
  await fireEvent.press(page.getByTestId('life-album-manage-save-name'));
  await waitFor(()=>expect(mockUpdate).toHaveBeenCalled());
  expect(page.getByTestId('life-album-manage-opening').props.value).toBe('暂未保存的开篇');
  await fireEvent.press(page.getByTestId('life-album-cancel-edit'));
  expect(page.queryByTestId('life-album-editor')).toBeNull();
  expect(page.getByTestId('life-album-contents')).toBeTruthy();
 });
 it('exposes move and remove only while organizing and restores the overview on done',async()=>{
  const page=await open();await menu(page);await fireEvent.press(page.getByTestId('life-album-organize'));
  expect(page.queryByTestId('life-album-contents')).toBeNull();
  expect(page.getByTestId('life-album-move-up-m1').props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(page.getByTestId('life-album-move-up-m1'));expect(mockMove).not.toHaveBeenCalled();
  await fireEvent.press(page.getByTestId('life-album-remove-m1'));await waitFor(()=>expect(mockWithdraw).toHaveBeenCalledWith({albumId:'album_1',momentId:'m1'}));
  await fireEvent.press(page.getByTestId('life-album-organize-done'));
  expect(page.queryByTestId('life-album-remove-m1')).toBeNull();expect(page.getByTestId('life-album-contents')).toBeTruthy();
 });
 it('retains album deletion confirmation and does not delete on menu selection alone',async()=>{
  const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
  const page=await open();await menu(page);await fireEvent.press(page.getByTestId('life-album-delete'));
  expect(alert).toHaveBeenCalled();expect(mockDelete).not.toHaveBeenCalled();
 });
 it('keeps an empty album manageable without opening an empty reader',async()=>{
  mockGetAlbum.mockResolvedValue({...manageView(),entries:[]});
  const page=await render(wrap());await waitFor(()=>expect(page.getByText('一些日子')).toBeTruthy());
  expect(page.getByTestId('life-album-preview-open').props.accessibilityState.disabled).toBe(true);
  await menu(page);await fireEvent.press(page.getByTestId('life-album-edit'));expect(page.getByTestId('life-album-editor')).toBeTruthy();
 });
});
