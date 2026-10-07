import type { ReactElement } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApplicationError } from '../application/errors';
import {
  ALBUM_CREATE_AND_COLLECT_ACTION,
  ALBUM_CREATE_ONLY_ACTION,
  ALBUM_CREATED_COLLECT_FAILED,
} from '../application/life-album';
import { ALBUM_SOURCE_UNAVAILABLE } from '../application/life-album-use-cases';
import {
  albumCollectCreateHref,
  consumeAlbumCollectCreateIntent,
  resetAlbumCollectCreateIntentsForTests,
} from './album-collect-create-intent';
import LifeAlbumNewScreen from './life-album-new-screen';

const mockCreate = jest.fn();
const mockCollect = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockDismissTo = jest.fn();
const mockGetState = jest.fn();
let mockParams: { m?: string; c?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: mockBack,
    replace: mockReplace,
    dismissTo: mockDismissTo,
  }),
  useNavigation: () => ({ getState: mockGetState }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    createAlbum: mockCreate,
    collectAlbumEntry: mockCollect,
  }),
}));

jest.mock('./settings-chrome', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View, Pressable, Text } = require('react-native');
  return {
    SettingsPage: ({
      children,
      onBack,
      pageTestID,
    }: {
      children: React.ReactNode;
      onBack?: () => void;
      pageTestID?: string;
    }) => (
      <View testID={pageTestID}>
        <Pressable testID="life-album-new-back" onPress={onBack}>
          <Text>back</Text>
        </Pressable>
        {children}
      </View>
    ),
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function wrap(node: ReactElement) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      {node}
    </SafeAreaProvider>
  );
}

describe('life album new screen', () => {
  beforeEach(() => {
    resetAlbumCollectCreateIntentsForTests();
    mockParams = {};
    mockCreate.mockReset();
    mockCollect.mockReset();
    mockReplace.mockReset();
    mockBack.mockReset();
    mockDismissTo.mockReset();
    mockGetState.mockReturnValue({
      index: 1,
      routes: [
        { name: 'moment/[id]', params: { id: 'moment_ready' } },
        { name: 'albums/new' },
      ],
    });
    mockCreate.mockResolvedValue({
      id: 'album_new',
      name: '一些日子',
      entries: [],
    });
    mockCollect.mockResolvedValue({
      album: { id: 'album_new', name: '一些日子', entries: [{ momentId: 'moment_ready' }] },
      inserted: true,
      alreadyCollected: false,
    });
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const ok = buttons?.find((button) => button.text === '好');
      ok?.onPress?.();
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates from the list without collecting', async () => {
    const view = await render(wrap(<LifeAlbumNewScreen />));
    expect(view.getByLabelText(ALBUM_CREATE_ONLY_ACTION)).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-new-save'));
    });
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCollect).not.toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/albums/[id]',
        params: { id: 'album_new' },
      });
    });
  });

  it('shows create-and-collect and writes both from a collect intent', async () => {
    const href = albumCollectCreateHref('moment_ready');
    mockParams = href.params;
    const view = await render(wrap(<LifeAlbumNewScreen />));
    expect(view.getByLabelText(ALBUM_CREATE_AND_COLLECT_ACTION)).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-new-save'));
    });
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCollect).toHaveBeenCalledWith({
        albumId: 'album_new',
        momentId: 'moment_ready',
      });
      expect(mockBack).toHaveBeenCalled();
    });
  });

  it('cancels without creating or collecting', async () => {
    const href = albumCollectCreateHref('moment_ready');
    mockParams = href.params;
    const view = await render(wrap(<LifeAlbumNewScreen />));
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-new-back'));
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCollect).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalled();
  });

  it('ignores double submit while create is in flight', async () => {
    const write = deferred<{ id: string; name: string; entries: never[] }>();
    mockCreate.mockReturnValue(write.promise);
    const href = albumCollectCreateHref('moment_ready');
    mockParams = href.params;
    const view = await render(wrap(<LifeAlbumNewScreen />));
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-new-save'));
      fireEvent.press(view.getByTestId('life-album-new-save'));
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    await act(async () => {
      write.resolve({ id: 'album_new', name: '一些日子', entries: [] });
    });
    await waitFor(() => {
      expect(mockCollect).toHaveBeenCalledTimes(1);
    });
  });

  it('retries collect against the same albumId after a collect failure', async () => {
    mockCollect
      .mockRejectedValueOnce(new Error('disk'))
      .mockResolvedValueOnce({
        album: { id: 'album_new', name: '一些日子', entries: [] },
        inserted: true,
        alreadyCollected: false,
      });
    const href = albumCollectCreateHref('moment_ready');
    mockParams = href.params;
    const view = await render(wrap(<LifeAlbumNewScreen />));
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-new-save'));
    });
    await waitFor(() => {
      expect(view.getByTestId('life-album-new-error').props.children).toBe(
        ALBUM_CREATED_COLLECT_FAILED,
      );
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-new-save'));
    });
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCollect).toHaveBeenCalledTimes(2);
      expect(mockCollect).toHaveBeenNthCalledWith(2, {
        albumId: 'album_new',
        momentId: 'moment_ready',
      });
    });
  });

  it('surfaces source-unavailable without claiming collect success', async () => {
    mockCollect.mockRejectedValue(
      new ApplicationError(ALBUM_SOURCE_UNAVAILABLE, '这条记录现在无法找到。'),
    );
    const href = albumCollectCreateHref('moment_ready');
    mockParams = href.params;
    const view = await render(wrap(<LifeAlbumNewScreen />));
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-new-save'));
    });
    await waitFor(() => {
      expect(view.getByTestId('life-album-new-error').props.children).toBe(
        '这条记录现在无法找到。',
      );
    });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('does not treat a consumed intent as collect mode', async () => {
    const first = albumCollectCreateHref('moment_old');
    mockParams = first.params;
    consumeAlbumCollectCreateIntent(first.params.c);
    const view = await render(wrap(<LifeAlbumNewScreen />));
    expect(view.getByLabelText(ALBUM_CREATE_ONLY_ACTION)).toBeTruthy();
  });
});
