import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LeaveScreen from '../app/leave';
import { peekJustSavedMomentId, resetJustSavedMomentIdForTests } from './recent-save-echo';

const mockBack = jest.fn();
const mockDismissTo = jest.fn();
const mockReplace = jest.fn();
const mockSaveTextMoment = jest.fn();
let mockSearchParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: mockBack,
    replace: mockReplace,
    dismissTo: mockDismissTo,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  writeAsStringAsync: jest.fn(async () => undefined),
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    restoreOrCreateDraft: async () => ({
      draftId: 'moment_draft',
      note: '门口的风还在。',
      isRestored: false,
      images: [],
      audio: null,
    }),
    updateDraftNote: async () => undefined,
    updateDraftEmotion: async () => undefined,
    updateDraftOccurred: async () => undefined,
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
    addLibraryImages: async () => undefined,
    addCameraImage: async () => undefined,
    saveTextMoment: mockSaveTextMoment,
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
      <LeaveScreen />
    </SafeAreaProvider>
  );
}

describe('leave entry copy and save dismiss', () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockDismissTo.mockReset();
    mockReplace.mockReset();
    mockSaveTextMoment.mockReset();
    mockSaveTextMoment.mockResolvedValue({ id: 'moment_draft' });
    mockSearchParams = {};
    resetJustSavedMomentIdForTests();
  });

  it('shows 最近 when Leave opened from Recent and still backs without saving', async () => {
    mockSearchParams = { from: 'recent' };
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByTestId('leave-back')).toBeTruthy();
    });
    expect(view.getByText('最近')).toBeTruthy();
    expect(view.getByLabelText('返回最近')).toBeTruthy();
    fireEvent.press(view.getByTestId('leave-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows 返回原来的位置 when Leave opened from Lookback', async () => {
    mockSearchParams = { from: 'lookback' };
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByTestId('leave-back')).toBeTruthy();
    });
    expect(view.getByText('返回原来的位置')).toBeTruthy();
    expect(view.getByLabelText('返回原来的位置')).toBeTruthy();
    fireEvent.press(view.getByTestId('leave-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('dismisses to Recent after save instead of replacing only Leave', async () => {
    mockSearchParams = { from: 'lookback' };
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByTestId('composer-save')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-save'));
    await waitFor(() => {
      expect(mockSaveTextMoment).toHaveBeenCalled();
    });
    expect(mockDismissTo).toHaveBeenCalledWith('/');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(peekJustSavedMomentId()).toBe('moment_draft');
  });
});
