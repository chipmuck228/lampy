import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LeaveScreen from '../app/leave';

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual('react');
    React.useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  writeAsStringAsync: jest.fn(async () => undefined),
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    restoreOrCreateDraft: async () => ({
      draftId: 'moment_restored',
      note: '还没留下的一句',
      isRestored: true,
      images: [
        {
          id: 'asset_restored',
          status: 'available' as const,
          uri: 'memory://assets/asset_restored.jpg',
          width: 800,
          height: 600,
          label: '照片 1/1',
        },
      ],
      audio: null,
    }),
    updateDraftNote: async () => undefined,
    updateDraftEmotion: async () => undefined,
    abandonActiveDraft: async () => ({
      composer: {
        draftId: 'moment_new',
        note: '',
        emotion: '',
        isRestored: false,
        images: [],
        audio: null,
      },
      cleanup: { removed: 0, kept: 0, failed: 0 },
    }),
    updateDraftOccurred: async () => undefined,
    addLibraryImages: async () => undefined,
    addCameraImage: async () => undefined,
    saveTextMoment: async () => ({ id: 'moment_restored' }),
  }),
}));

describe('leave screen', () => {
  it('restores the unfinished draft instead of starting a new one', async () => {
    const view = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <LeaveScreen />
      </SafeAreaProvider>,
    );

    await waitFor(() => {
      expect(view.getByText('上次没保存的内容已放回来。')).toBeTruthy();
    });
    expect(view.getByDisplayValue('还没留下的一句')).toBeTruthy();
    expect(view.getByLabelText('当时的感受')).toBeTruthy();
    expect(view.getByLabelText('当时的感受，高兴').props.accessibilityState.selected).toBe(false);
    expect(view.getByLabelText('照片 1/1')).toBeTruthy();
    expect(view.getByLabelText('拍摄')).toBeTruthy();
    expect(view.getByLabelText('照片')).toBeTruthy();
    expect(view.getByTestId('composer-note').props.editable).toBe(true);
    expect(view.getByLabelText('放弃这份草稿')).toBeTruthy();
    expect(view.getByLabelText('移除这张照片，照片 1/1')).toBeTruthy();
  });
});

// Page tests model a foreground navigation screen.
beforeEach(() => {
  const { AppState } = jest.requireActual('react-native');
  Object.defineProperty(AppState, 'currentState', { value: 'active', writable: true, configurable: true });
});
