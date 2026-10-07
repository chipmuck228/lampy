import type { ReactElement } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApplicationError } from '../application/errors';
import {
  ALBUM_CREATE_AND_COLLECT_ACTION,
  ALBUM_CREATE_COLLECT_RETRY,
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
const mockBeforeRemoveListeners = new Set<() => void>();
let mockParams: { m?: string; c?: string } = {};
let mockFocusCleanup: (() => void) | undefined;
let mockUseCasesGate: Promise<unknown> | null = null;

const mockNavigation = {
  getState: () => mockGetState(),
  addListener: (event: string, cb: () => void) => {
    if (event === 'beforeRemove') mockBeforeRemoveListeners.add(cb);
    return () => {
      mockBeforeRemoveListeners.delete(cb);
    };
  },
};

const mockRouter = {
  push: jest.fn(),
  back: (...args: unknown[]) => mockBack(...args),
  replace: (...args: unknown[]) => mockReplace(...args),
  dismissTo: (...args: unknown[]) => mockDismissTo(...args),
};

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  return {
    useRouter: () => mockRouter,
    useNavigation: () => mockNavigation,
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => {
        const cleanup = effect();
        mockFocusCleanup = typeof cleanup === 'function' ? cleanup : undefined;
        return () => {
          if (typeof cleanup === 'function') cleanup();
          mockFocusCleanup = undefined;
        };
      }, [effect]);
    },
  };
});

jest.mock('../application/container', () => ({
  getUseCases: () => {
    if (mockUseCasesGate) {
      return mockUseCasesGate.then(() => ({
        createAlbum: mockCreate,
        collectAlbumEntry: mockCollect,
      }));
    }
    return Promise.resolve({
      createAlbum: mockCreate,
      collectAlbumEntry: mockCollect,
    });
  },
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

function fireBeforeRemove() {
  for (const listener of [...mockBeforeRemoveListeners]) listener();
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
    mockBeforeRemoveListeners.clear();
    mockFocusCleanup = undefined;
    mockUseCasesGate = null;
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

  it('does not create when leaving while getUseCases is pending', async () => {
    const gate = deferred<void>();
    mockUseCasesGate = gate.promise;
    const href = albumCollectCreateHref('moment_ready');
    mockParams = href.params;
    const view = await render(wrap(<LifeAlbumNewScreen />));
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-new-save'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-new-back'));
    });
    await act(async () => {
      gate.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCollect).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('does not collect or alert after leaving during create', async () => {
    const write = deferred<{ id: string; name: string; entries: never[] }>();
    mockCreate.mockReturnValue(write.promise);
    const href = albumCollectCreateHref('moment_ready');
    mockParams = href.params;
    const view = await render(wrap(<LifeAlbumNewScreen />));
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-new-save'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-new-back'));
    });
    await act(async () => {
      write.resolve({ id: 'album_new', name: '秋日', entries: [] });
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockCollect).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('ignores a late collect result after blur invalidation', async () => {
    const collect = deferred<{
      album: { id: string; name: string; entries: { momentId: string }[] };
      inserted: boolean;
      alreadyCollected: boolean;
    }>();
    mockCollect.mockReturnValue(collect.promise);
    const href = albumCollectCreateHref('moment_ready');
    mockParams = href.params;
    const view = await render(wrap(<LifeAlbumNewScreen />));
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-new-save'));
    });
    await waitFor(() => {
      expect(mockCollect).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      mockFocusCleanup?.();
    });
    await act(async () => {
      collect.resolve({
        album: { id: 'album_new', name: '一些日子', entries: [{ momentId: 'moment_ready' }] },
        inserted: true,
        alreadyCollected: false,
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    expect(view.queryByTestId('life-album-new-error')).toBeNull();
  });

  it('does not navigate from a stale success OK after leave', async () => {
    let okPress: (() => void) | undefined;
    (Alert.alert as jest.Mock).mockImplementation((_title, _message, buttons) => {
      okPress = buttons?.find((button: { text?: string }) => button.text === '好')?.onPress;
    });
    const href = albumCollectCreateHref('moment_ready');
    mockParams = href.params;
    const view = await render(wrap(<LifeAlbumNewScreen />));
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-new-save'));
    });
    await waitFor(() => {
      expect(okPress).toBeTruthy();
    });
    await act(async () => {
      fireBeforeRemove();
      fireEvent.press(view.getByTestId('life-album-new-back'));
    });
    mockBack.mockClear();
    await act(async () => {
      okPress?.();
    });
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockDismissTo).not.toHaveBeenCalled();
  });

  it('does not let an old request act on a new moment source', async () => {
    const write = deferred<{ id: string; name: string; entries: never[] }>();
    mockCreate.mockReturnValue(write.promise);
    const first = albumCollectCreateHref('moment_old');
    mockParams = first.params;
    const view = await render(wrap(<LifeAlbumNewScreen />));
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-new-save'));
    });
    const second = albumCollectCreateHref('moment_new');
    await act(async () => {
      mockParams = second.params;
      view.rerender(wrap(<LifeAlbumNewScreen />));
    });
    await act(async () => {
      write.resolve({ id: 'album_old', name: '旧册', entries: [] });
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockCollect).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(view.getByLabelText(ALBUM_CREATE_AND_COLLECT_ACTION)).toBeTruthy();
  });

  it('retries collect against the same albumId after a collect failure', async () => {
    mockCreate.mockResolvedValue({
      id: 'album_new',
      name: '秋日',
      entries: [],
    });
    mockCollect
      .mockRejectedValueOnce(new Error('disk'))
      .mockResolvedValueOnce({
        album: { id: 'album_new', name: '秋日', entries: [] },
        inserted: true,
        alreadyCollected: false,
      });
    const href = albumCollectCreateHref('moment_ready');
    mockParams = href.params;
    const view = await render(wrap(<LifeAlbumNewScreen />));
    await act(async () => {
      fireEvent.changeText(view.getByTestId('life-album-new-name'), '草稿名');
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-new-save'));
    });
    await waitFor(() => {
      expect(view.getByTestId('life-album-new-error').props.children).toBe(
        ALBUM_CREATED_COLLECT_FAILED,
      );
    });
    expect(view.getByTestId('life-album-new-name').props.value).toBe('秋日');
    expect(view.getByTestId('life-album-new-name').props.editable).toBe(false);
    expect(view.getByLabelText(ALBUM_CREATE_COLLECT_RETRY)).toBeTruthy();
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
    expect(Alert.alert).toHaveBeenCalledWith(
      '已加入此册',
      '已收进「秋日」',
      expect.any(Array),
    );
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
