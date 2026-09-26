import type { ReactElement } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApplicationError } from '../application/errors';
import type { FamilyInboxView } from '../application/family-use-cases';
import FamilyScreen from './family-screen';
import { isFamilyApiConfigured } from '../infrastructure/family-config';

const mockFamily = {
  getMembership: jest.fn(),
  listPendingInvitations: jest.fn(async () => []),
  signInWithApple: jest.fn(),
  createFamily: jest.fn(),
  acceptInvitation: jest.fn(),
  inviteMember: jest.fn(),
  revokeInvitation: jest.fn(),
  leaveFamily: jest.fn(),
  removeMember: jest.fn(),
  dissolveFamily: jest.fn(),
  signOut: jest.fn(),
  hasUnconfirmedSessionRevoke: jest.fn(async () => false),
  refreshFamilyInbox: jest.fn(async (): Promise<FamilyInboxView> => ({ kind: 'hidden', reason: 'unauthenticated' })),
  receiveShare: jest.fn(),
  revokeShare: jest.fn(),
};

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(effect, [effect]);
    },
  };
});

jest.mock('../application/container', () => ({
  getFamilyUseCases: async () => mockFamily,
}));

jest.mock('../infrastructure/family-config', () => ({
  isFamilyApiConfigured: jest.fn(() => false),
}));

const mockTestDriver = { enabled: false, inviteCode: '' };

jest.mock('../infrastructure/family-test-driver', () => ({
  isFamilyTestDriverEnabled: () => mockTestDriver.enabled,
  familyTestIdentityToken: (account: 'alice' | 'bob') => (account === 'alice' ? 'apple_alice' : 'apple_bob'),
  familyTestInviteCode: () => mockTestDriver.inviteCode,
  familyTestInviteSource: () => (mockTestDriver.inviteCode ? 'stored' : 'none'),
  familyTestLastRequest: () => null,
  formatFamilyTestLastRequest: () => null,
  recordFamilyTestLastRequest: jest.fn(),
  storeFamilyTestInviteCode: jest.fn((code: string) => {
    mockTestDriver.inviteCode = code;
  }),
  armFamilyTestNextRequestFailure: jest.fn(),
  consumeFamilyTestNextRequestFailure: jest.fn(),
}));

jest.mock('../infrastructure/expo-apple-auth', () => ({
  createExpoAppleIdentityTokenSource: () => ({
    isAvailable: async () => true,
    requestIdentityToken: async () => 'identity-token',
  }),
}));

function wrap(ui: ReactElement) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      {ui}
    </SafeAreaProvider>
  );
}

describe('family screen', () => {
  beforeEach(() => {
    mockTestDriver.enabled = false;
    mockTestDriver.inviteCode = '';
    const { storeFamilyTestInviteCode } = jest.requireMock('../infrastructure/family-test-driver') as {
      storeFamilyTestInviteCode: jest.Mock;
    };
    storeFamilyTestInviteCode.mockClear();
    jest.mocked(isFamilyApiConfigured).mockReturnValue(false);
    mockFamily.getMembership.mockReset();
    mockFamily.listPendingInvitations.mockReset().mockResolvedValue([]);
    mockFamily.signOut.mockReset();
    mockFamily.hasUnconfirmedSessionRevoke.mockReset().mockResolvedValue(false);
    mockFamily.refreshFamilyInbox.mockReset().mockResolvedValue({ kind: 'hidden', reason: 'unauthenticated' });
    mockFamily.inviteMember.mockReset().mockResolvedValue({
      invitationId: 'inv_1',
      familyId: 'fam_1',
      code: 'CODE',
      status: 'pending',
      expiresAt: '2026-09-25T07:00:00.000Z',
    });
  });

  it('shows an accurate unavailable state when the family API is not configured', async () => {
    const view = await render(wrap(<FamilyScreen />));
    await waitFor(() => {
      expect(view.getByText('还没有接到能用的家庭服务。个人记录还在这台设备上。')).toBeTruthy();
    });
    expect(view.queryByText('家里现在有这些人。')).toBeNull();
    expect(view.queryByText(/时间线|假成员/)).toBeNull();
  });

  it('does not treat an unreachable server as a joined family', async () => {
    jest.mocked(isFamilyApiConfigured).mockReturnValue(true);
    mockFamily.getMembership.mockResolvedValue({ kind: 'unconfirmed', reason: 'unreachable' });
    const view = await render(wrap(<FamilyScreen />));
    await waitFor(() => {
      expect(view.getByText('现在连不上家庭服务，不能确认家里有谁。')).toBeTruthy();
    });
    expect(view.queryByText('家里现在有这些人。')).toBeNull();
    expect(view.queryByLabelText('建立家庭')).toBeNull();
  });

  it('shows only real members after a confirmed membership', async () => {
    jest.mocked(isFamilyApiConfigured).mockReturnValue(true);
    mockFamily.getMembership.mockResolvedValue({
      kind: 'ready',
      familyId: 'fam_1',
      role: 'creator',
      members: [{ userId: 'usr_alice', role: 'creator', joinedAt: '2026-09-25T03:00:00.000Z' }],
    });
    const view = await render(wrap(<FamilyScreen />));
    await waitFor(() => {
      expect(view.getByText('家里现在有这些人。')).toBeTruthy();
    });
    expect(view.getByText('usr_alice')).toBeTruthy();
    expect(view.getByLabelText('邀请')).toBeTruthy();
    expect(view.queryByText(/假送达|家庭时间线|家人已收到/)).toBeNull();
  });

  it('keeps the test-only join control visible so bob can accept after the creator invite is stored', async () => {
    mockTestDriver.enabled = true;
    jest.mocked(isFamilyApiConfigured).mockReturnValue(true);
    mockFamily.getMembership.mockResolvedValue({ kind: 'none' });
    const view = await render(wrap(<FamilyScreen />));
    await waitFor(() => {
      expect(view.getByTestId('family-test-accept-invite')).toBeTruthy();
    });
    expect(view.queryByTestId('family-test-sign-in-alice')).toBeTruthy();
    expect(view.queryByTestId('family-test-sign-in-bob')).toBeTruthy();
    expect(view.getByTestId('family-test-create')).toBeTruthy();
    expect(view.getByTestId('family-test-invite')).toBeTruthy();
  });

  it('stores the pending invite code when the creator invites from the family screen', async () => {
    const { storeFamilyTestInviteCode } = jest.requireMock('../infrastructure/family-test-driver') as {
      storeFamilyTestInviteCode: jest.Mock;
    };
    mockTestDriver.enabled = true;
    jest.mocked(isFamilyApiConfigured).mockReturnValue(true);
    mockFamily.getMembership.mockResolvedValue({
      kind: 'ready',
      familyId: 'fam_1',
      role: 'creator',
      members: [{ userId: 'usr_alice', role: 'creator', joinedAt: '2026-09-25T03:00:00.000Z' }],
    });
    const view = await render(wrap(<FamilyScreen />));
    await waitFor(() => {
      expect(view.getByLabelText('邀请')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('family-invite'));
    await waitFor(() => {
      expect(storeFamilyTestInviteCode).toHaveBeenCalledWith('CODE');
    });
  });

  it('lists a received share as household content and never says family received it', async () => {
    jest.mocked(isFamilyApiConfigured).mockReturnValue(true);
    mockFamily.getMembership.mockResolvedValue({
      kind: 'ready',
      familyId: 'fam_1',
      role: 'member',
      members: [{ userId: 'usr_bob', role: 'member', joinedAt: '2026-09-25T03:00:00.000Z' }],
    });
    mockFamily.refreshFamilyInbox.mockResolvedValue({
      kind: 'ready',
      familyId: 'fam_1',
      items: [
        {
          shareId: 'shr_1',
          familyId: 'fam_1',
          snapshotRevision: 1,
          note: '门口的风',
          emotion: '平静',
          occurredAtPrecision: 'day',
          receiveStatus: 'listed',
          expectedMediaCount: 1,
          storedMediaCount: 0,
          canRevoke: false,
        },
      ],
    });
    const view = await render(wrap(<FamilyScreen />));
    await waitFor(() => {
      expect(view.getByText('家里有这条分享')).toBeTruthy();
    });
    expect(view.getByLabelText('收下这条分享')).toBeTruthy();
    expect(view.queryByText(/家人已收到/)).toBeNull();
  });

  it('offers Apple sign-in again after a stored session is rejected', async () => {
    jest.mocked(isFamilyApiConfigured).mockReturnValue(true);
    mockFamily.getMembership.mockResolvedValue({ kind: 'unconfirmed', reason: 'unauthenticated' });
    const view = await render(wrap(<FamilyScreen />));
    await waitFor(() => {
      expect(view.getByText('这次登录已经失效，需要重新用 Apple 登录。登录成功还不等于已经在一个家里。')).toBeTruthy();
    });
    expect(view.getByLabelText('用 Apple 登录')).toBeTruthy();
    expect(view.queryByLabelText('退出登录')).toBeNull();
    expect(view.queryByText('家里现在有这些人。')).toBeNull();
  });

  it('keeps confirmed members if only the pending-invite list fails', async () => {
    jest.mocked(isFamilyApiConfigured).mockReturnValue(true);
    mockFamily.getMembership.mockResolvedValue({
      kind: 'ready',
      familyId: 'fam_1',
      role: 'creator',
      members: [{ userId: 'usr_alice', role: 'creator', joinedAt: '2026-09-25T03:00:00.000Z' }],
    });
    mockFamily.listPendingInvitations.mockRejectedValue(new ApplicationError('INTERNAL', 'invite list failed'));
    const view = await render(wrap(<FamilyScreen />));
    await waitFor(() => {
      expect(view.getByText('usr_alice')).toBeTruthy();
      expect(view.getByText('邀请列表暂时读不出来，家里的成员已经确认。')).toBeTruthy();
    });
    expect(view.getByLabelText('解散这个家')).toBeTruthy();
    expect(view.getByLabelText('邀请')).toBeTruthy();
    expect(mockFamily.refreshFamilyInbox).toHaveBeenCalled();
  });

  it('refreshes shares after a remote revoke even when the invite list fails', async () => {
    jest.mocked(isFamilyApiConfigured).mockReturnValue(true);
    mockFamily.getMembership.mockResolvedValue({
      kind: 'ready',
      familyId: 'fam_1',
      role: 'creator',
      members: [{ userId: 'usr_alice', role: 'creator', joinedAt: '2026-09-25T03:00:00.000Z' }],
    });
    mockFamily.refreshFamilyInbox.mockResolvedValue({
      kind: 'ready',
      familyId: 'fam_1',
      items: [
        {
          shareId: 'shr_1',
          familyId: 'fam_1',
          snapshotRevision: 1,
          note: '门口的风',
          emotion: '平静',
          occurredAtPrecision: 'day',
          receiveStatus: 'received',
          expectedMediaCount: 0,
          storedMediaCount: 0,
          canRevoke: true,
        },
      ],
    });
    const view = await render(wrap(<FamilyScreen />));
    await waitFor(() => {
      expect(view.getByText('文字：门口的风')).toBeTruthy();
    });

    mockFamily.listPendingInvitations.mockRejectedValue(new ApplicationError('INTERNAL', 'invite list failed'));
    mockFamily.refreshFamilyInbox.mockResolvedValue({
      kind: 'ready',
      familyId: 'fam_1',
      items: [],
    });
    fireEvent.press(view.getByLabelText('邀请'));
    await waitFor(() => {
      expect(view.queryByText('文字：门口的风')).toBeNull();
      expect(view.queryByText('家里有这条分享')).toBeNull();
      expect(view.getByText('邀请列表暂时读不出来，家里的成员已经确认。')).toBeTruthy();
      expect(view.getByText('usr_alice')).toBeTruthy();
    });
    expect(mockFamily.refreshFamilyInbox).toHaveBeenCalled();
  });

  it('hides family shares when the share list request fails', async () => {
    jest.mocked(isFamilyApiConfigured).mockReturnValue(true);
    mockFamily.getMembership.mockResolvedValue({
      kind: 'ready',
      familyId: 'fam_1',
      role: 'creator',
      members: [{ userId: 'usr_alice', role: 'creator', joinedAt: '2026-09-25T03:00:00.000Z' }],
    });
    mockFamily.refreshFamilyInbox.mockResolvedValue({
      kind: 'ready',
      familyId: 'fam_1',
      items: [
        {
          shareId: 'shr_1',
          familyId: 'fam_1',
          snapshotRevision: 1,
          note: '门口的风',
          emotion: '',
          occurredAtPrecision: 'day',
          receiveStatus: 'received',
          expectedMediaCount: 0,
          storedMediaCount: 0,
          canRevoke: true,
        },
      ],
    });
    const view = await render(wrap(<FamilyScreen />));
    await waitFor(() => {
      expect(view.getByText('文字：门口的风')).toBeTruthy();
    });
    mockFamily.refreshFamilyInbox.mockRejectedValue(new ApplicationError('NETWORK', 'share list failed'));
    fireEvent.press(view.getByLabelText('邀请'));
    await waitFor(() => {
      expect(view.queryByText('文字：门口的风')).toBeNull();
      expect(view.getByText('usr_alice')).toBeTruthy();
    });
  });

  it('shows an unconfirmed remote revoke after a later refresh without treating it as a live session', async () => {
    jest.mocked(isFamilyApiConfigured).mockReturnValue(true);
    mockFamily.getMembership.mockResolvedValue({ kind: 'unauthenticated' });
    mockFamily.hasUnconfirmedSessionRevoke.mockResolvedValue(true);
    const view = await render(wrap(<FamilyScreen />));
    await waitFor(() => {
      expect(view.getByText('这台设备已经退出。远端会话还没确认撤销，连上之后会再试。')).toBeTruthy();
      expect(view.getByLabelText('用 Apple 登录')).toBeTruthy();
    });
    expect(view.queryByText('家里现在有这些人。')).toBeNull();
  });

  it('hides family content immediately on sign-out and does not claim a remote revoke when it is unconfirmed', async () => {
    jest.mocked(isFamilyApiConfigured).mockReturnValue(true);
    mockFamily.getMembership
      .mockResolvedValueOnce({
        kind: 'ready',
        familyId: 'fam_1',
        role: 'creator',
        members: [{ userId: 'usr_alice', role: 'creator', joinedAt: '2026-09-25T03:00:00.000Z' }],
      })
      .mockResolvedValue({ kind: 'unauthenticated' });
    mockFamily.signOut.mockResolvedValue({ local: 'signed-out', server: 'unconfirmed' });
    mockFamily.hasUnconfirmedSessionRevoke.mockResolvedValue(true);
    const view = await render(wrap(<FamilyScreen />));
    await waitFor(() => {
      expect(view.getByLabelText('退出登录')).toBeTruthy();
    });
    fireEvent.press(view.getByLabelText('退出登录'));
    await waitFor(() => {
      expect(view.queryByText('usr_alice')).toBeNull();
      expect(view.getByText('这台设备已经退出。远端会话还没确认撤销，连上之后会再试。')).toBeTruthy();
      expect(view.queryByText('已经退出登录。')).toBeNull();
    });
  });

  it('keeps the signed-in family page when pending revoke cannot be saved', async () => {
    jest.mocked(isFamilyApiConfigured).mockReturnValue(true);
    mockFamily.getMembership.mockResolvedValue({
      kind: 'ready',
      familyId: 'fam_1',
      role: 'creator',
      members: [{ userId: 'usr_alice', role: 'creator', joinedAt: '2026-09-25T03:00:00.000Z' }],
    });
    mockFamily.signOut.mockResolvedValue({ local: 'still-signed-in', server: 'unconfirmed' });
    const view = await render(wrap(<FamilyScreen />));
    await waitFor(() => {
      expect(view.getByLabelText('退出登录')).toBeTruthy();
    });
    fireEvent.press(view.getByLabelText('退出登录'));
    await waitFor(() => {
      expect(view.getByText('usr_alice')).toBeTruthy();
      expect(view.getByText('这次退出没做成。这台设备还登着，远端会话也还没确认撤销。')).toBeTruthy();
      expect(view.queryByText('已经退出登录。')).toBeNull();
      expect(view.queryByText(/远端会话还没确认撤销，连上之后会再试/)).toBeNull();
    });
  });

  it('says the device signed out after a confirmed server revoke', async () => {
    jest.mocked(isFamilyApiConfigured).mockReturnValue(true);
    mockFamily.getMembership
      .mockResolvedValueOnce({
        kind: 'ready',
        familyId: 'fam_1',
        role: 'creator',
        members: [{ userId: 'usr_alice', role: 'creator', joinedAt: '2026-09-25T03:00:00.000Z' }],
      })
      .mockResolvedValue({ kind: 'unauthenticated' });
    mockFamily.signOut.mockResolvedValue({ local: 'signed-out', server: 'revoked' });
    const view = await render(wrap(<FamilyScreen />));
    await waitFor(() => {
      expect(view.getByLabelText('退出登录')).toBeTruthy();
    });
    fireEvent.press(view.getByLabelText('退出登录'));
    await waitFor(() => {
      expect(view.getByText('已经退出登录。')).toBeTruthy();
      expect(view.queryByText(/远端会话还没确认撤销/)).toBeNull();
    });
  });

  it('hides previous members and admin actions when re-entering and revalidation fails', async () => {
    jest.mocked(isFamilyApiConfigured).mockReturnValue(true);
    mockFamily.getMembership.mockResolvedValue({
      kind: 'ready',
      familyId: 'fam_1',
      role: 'creator',
      members: [{ userId: 'usr_alice', role: 'creator', joinedAt: '2026-09-25T03:00:00.000Z' }],
    });
    const first = await render(wrap(<FamilyScreen />));
    await waitFor(() => {
      expect(first.getByText('usr_alice')).toBeTruthy();
      expect(first.getByLabelText('解散这个家')).toBeTruthy();
    });
    first.unmount();

    mockFamily.getMembership.mockRejectedValue(new ApplicationError('INTERNAL', 'membership lookup failed'));
    const second = await render(wrap(<FamilyScreen />));
    await waitFor(() => {
      expect(second.getByText('家庭这件事没有做成。个人记录还在这台设备上。')).toBeTruthy();
    });
    expect(second.queryByText('家里现在有这些人。')).toBeNull();
    expect(second.queryByText('usr_alice')).toBeNull();
    expect(second.queryByLabelText('移出 usr_alice')).toBeNull();
    expect(second.queryByLabelText('解散这个家')).toBeNull();
    expect(second.queryByLabelText('邀请')).toBeNull();
  });
});
