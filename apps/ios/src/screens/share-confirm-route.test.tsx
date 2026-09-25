import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ShareConfirmRoute from '../app/share/[id]';
import { isFamilyApiConfigured } from '../infrastructure/family-config';

const mockPrepare = jest.fn();
const mockConfirm = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'moment_gate' }),
}));

jest.mock('../application/container', () => ({
  getFamilyUseCases: async () => ({
    prepareSharePreview: mockPrepare,
    confirmShareMoment: mockConfirm,
  }),
}));

jest.mock('../infrastructure/family-config', () => ({
  isFamilyApiConfigured: jest.fn(() => true),
}));

function wrap() {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ShareConfirmRoute />
    </SafeAreaProvider>
  );
}

describe('share confirm route', () => {
  beforeEach(() => {
    jest.mocked(isFamilyApiConfigured).mockReturnValue(true);
    mockPrepare.mockReset();
    mockConfirm.mockReset();
  });

  it('stays closed when the family API is not configured', async () => {
    jest.mocked(isFamilyApiConfigured).mockReturnValue(false);
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByText('还没有接到能用的家庭服务。个人记录还在这台设备上。')).toBeTruthy();
    });
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(view.queryByText('确认分享')).toBeNull();
  });

  it('loads a personal preview and confirms without a caller media list', async () => {
    mockPrepare.mockResolvedValue({
      familyId: 'fam_1',
      sourceMomentId: 'moment_gate',
      sourceRevision: 2,
      note: '门口的风',
      emotion: '平静',
      occurredAt: '2026-09-25T03:00:00.000Z',
      occurredAtPrecision: 'exact',
      media: [{ assetId: 'asset_photo', mimeType: 'image/jpeg', ready: true }],
      canConfirm: true,
    });
    mockConfirm.mockResolvedValue({
      status: 'stored',
      share: {
        shareId: 'shr_1',
        familyId: 'fam_1',
        authorUserId: 'usr_1',
        sourceMomentId: 'moment_gate',
        sourceRevision: 2,
        snapshot: {
          note: '门口的风',
          emotion: '平静',
          occurredAtPrecision: 'exact',
          media: [],
          origin: {
            type: 'received',
            transmissionId: 'shr_1',
            originalMomentId: 'moment_gate',
            snapshotRevision: 2,
          },
        },
        audienceUserIds: ['usr_1'],
        sharedAt: '2026-09-25T04:00:00.000Z',
        stored: 'server',
      },
    });
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByText('文字：门口的风')).toBeTruthy();
    });
    expect(mockPrepare).toHaveBeenCalledWith('moment_gate');
    await act(async () => {
      fireEvent.press(view.getByText('确认分享'));
    });
    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith({
        momentId: 'moment_gate',
        sourceRevision: 2,
      });
    });
    expect(mockConfirm.mock.calls[0][0].mediaByAsset).toBeUndefined();
    await waitFor(() => {
      expect(view.getByText('分享已经保存在家里的服务上。')).toBeTruthy();
    });
    expect(view.queryByText(/家人已收到/)).toBeNull();
  });
});
