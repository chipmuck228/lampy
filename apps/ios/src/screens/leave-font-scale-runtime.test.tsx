import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LeaveScreen from '../app/leave';
import { ApplicationError } from '../application/errors';

const mockRestore = jest.fn();
const mockAddCameraImage = jest.fn();
const mockSaveTextMoment = jest.fn();

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
    restoreOrCreateDraft: mockRestore,
    updateDraftNote: async () => undefined,
    updateDraftEmotion: async () => undefined,
    updateDraftOccurred: async () => undefined,
    addLibraryImages: async () => undefined,
    addCameraImage: mockAddCameraImage,
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

const liveDraft = {
  draftId: 'moment_draft',
  note: '门口的风还在。',
  emotion: '平静',
  isRestored: true,
  images: [
    {
      id: 'asset_one',
      status: 'available' as const,
      uri: 'memory://assets/asset_one.jpg',
      width: 800,
      height: 600,
      label: '照片 1/1',
    },
  ],
  audio: {
    id: 'asset_voice',
    status: 'available' as const,
    uri: 'memory://assets/asset_voice.m4a',
    durationMs: 3500,
    durationLabel: '4秒',
    label: '当时的声音',
  },
  occurred: { kind: 'today' as const, label: '今天' },
};

function setWindow(width = 390, fontScale = 1) {
  Dimensions.set({
    window: { width, height: 844, scale: 3, fontScale },
    screen: { width, height: 844, scale: 3, fontScale },
  });
}

async function expectFixedType(
  view: { getByTestId: (id: string) => { props: { children?: unknown; allowFontScaling?: boolean; style?: unknown } } },
  mode: 'row' | 'stack',
) {
  await waitFor(() => {
    expect(view.getByTestId('composer-type-policy').props.children).toBe('fixed');
    expect(view.getByTestId('composer-actions-mode').props.children).toBe(mode);
  });
  expect(view.getByTestId('composer-note').props.allowFontScaling).toBe(false);
  expect((StyleSheet.flatten(view.getByTestId('composer-note').props.style) as { fontSize?: number }).fontSize).toBe(17);
}

describe('leave keeps a fixed type scale when the system type changes', () => {
  beforeEach(() => {
    mockRestore.mockReset();
    mockAddCameraImage.mockReset();
    mockSaveTextMoment.mockReset();
    mockRestore.mockResolvedValue(liveDraft);
    mockSaveTextMoment.mockResolvedValue({ id: 'moment_draft' });
    setWindow(390, 1);
  });

  it('keeps the draft and action row when the system type goes regular → max → small', async () => {
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByTestId('composer-note').props.value).toBe('门口的风还在。');
    });
    await expectFixedType(view, 'row');
    expect(view.getByLabelText('当时的感受，平静')).toBeTruthy();
    expect(view.getByLabelText('这件事发生在哪一天')).toBeTruthy();
    expect(view.getByText('今天')).toBeTruthy();
    expect(view.getByLabelText('照片 1/1')).toBeTruthy();
    expect(view.getByText('一段声音 · 4秒')).toBeTruthy();

    fireEvent(view.getByTestId('composer-note'), 'contentSizeChange', {
      nativeEvent: { contentSize: { width: 300, height: 320 } },
    });

    setWindow(390, 3.1);
    await expectFixedType(view, 'row');
    expect(view.getByTestId('composer-note').props.value).toBe('门口的风还在。');
    expect(view.getByLabelText('当时的感受，平静')).toBeTruthy();
    expect(view.getByLabelText('照片 1/1')).toBeTruthy();
    expect(view.getByText('一段声音 · 4秒')).toBeTruthy();

    setWindow(390, 0.8);
    await expectFixedType(view, 'row');
    expect(view.getByTestId('composer-note').props.value).toBe('门口的风还在。');
    expect(view.getByLabelText('当时的感受，平静')).toBeTruthy();
    expect(view.getByLabelText('这件事发生在哪一天')).toBeTruthy();
    expect(view.getByText('今天')).toBeTruthy();
    expect(view.getByLabelText('照片 1/1')).toBeTruthy();
    expect(view.getByText('一段声音 · 4秒')).toBeTruthy();
    expect(view.getByLabelText('拍摄')).toBeEnabled();
    expect(view.getByTestId('composer-save')).toBeEnabled();
  });

  it('keeps writing after a camera denial when the system type changes', async () => {
    mockAddCameraImage.mockRejectedValueOnce(
      new ApplicationError(
        'CAMERA_DENIED',
        '没有打开相机。还可以写字，也可以用其他已允许的方式留下。草稿还在。打开系统设置允许相机后，可以再试。',
      ),
    );
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByTestId('composer-note').props.value).toBe('门口的风还在。');
    });
    setWindow(390, 3.1);
    await expectFixedType(view, 'row');
    fireEvent.press(view.getByTestId('composer-camera'));
    await waitFor(() => {
      expect(view.getByText('相机未打开，草稿还在。')).toBeTruthy();
    });
    expect(view.getByLabelText('查看说明')).toBeTruthy();
    expect(view.getByTestId('composer-save')).toBeEnabled();
    expect(view.getByTestId('leave-back')).toBeTruthy();

    setWindow(390, 1);
    await expectFixedType(view, 'row');
    expect(view.getByText('相机未打开，草稿还在。')).toBeTruthy();
    fireEvent.press(view.getByTestId('composer-feedback-detail'));
    await waitFor(() => {
      expect(view.getByTestId('composer-feedback-detail-body')).toBeTruthy();
    });
    expect(
      view.getByText(
        '没有打开相机。还可以写字，也可以用其他已允许的方式留下。草稿还在。打开系统设置允许相机后，可以再试。',
      ),
    ).toBeTruthy();
    fireEvent.press(view.getByTestId('composer-feedback-detail-close'));
    await waitFor(() => {
      expect(view.queryByTestId('composer-feedback-sheet')).toBeNull();
    });
    fireEvent.changeText(view.getByTestId('composer-note'), '门口的风还在。又写了一句。');
    await waitFor(() => {
      expect(view.getByTestId('composer-note').props.value).toBe('门口的风还在。又写了一句。');
    });
    expect(view.getByLabelText('照片 1/1')).toBeTruthy();
    expect(view.getByText('一段声音 · 4秒')).toBeTruthy();
    expect(view.getByTestId('composer-save')).toBeEnabled();
  });
});

// Page tests model a foreground navigation screen.
beforeEach(() => {
  const { AppState } = jest.requireActual('react-native');
  Object.defineProperty(AppState, 'currentState', { value: 'active', writable: true, configurable: true });
});
