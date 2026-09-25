import type { ReactElement } from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
};

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
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
    jest.mocked(isFamilyApiConfigured).mockReturnValue(false);
    mockFamily.getMembership.mockReset();
    mockFamily.listPendingInvitations.mockReset().mockResolvedValue([]);
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
    expect(view.queryByText(/假送达|家庭时间线/)).toBeNull();
  });
});
