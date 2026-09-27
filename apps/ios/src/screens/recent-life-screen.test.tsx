import type { ReactElement } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { resetStartupBrandForTests, setBrandReadyTimeoutForTests } from '../application/startup-brand';
import RecentScreen from '../app/index';

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

const mockGetRecentLife = jest.fn();

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getRecentLife: mockGetRecentLife,
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

function item(
  id: string,
  note: string,
  dayLabel: string,
  recordedAt: string,
  dayKey: string,
  occurredLabel: string | null = null,
) {
  return {
    id,
    note,
    recordedAt,
    dayKey,
    dayLabel,
    dateLabel: `记录于 ${dayLabel}`,
    occurredLabel,
    feeling: null,
    images: [],
    audio: null,
    unknownMedia: [],
  };
}

function life(items: ReturnType<typeof item>[]) {
  const days = items.reduce<
    { key: string; label: string; items: ReturnType<typeof item>[] }[]
  >((groups, next) => {
    const last = groups[groups.length - 1];
    if (last && last.key === next.dayKey) last.items.push(next);
    else groups.push({ key: next.dayKey, label: next.dateLabel, items: [next] });
    return groups;
  }, []);
  return { isFirstUse: false, items, days };
}

describe('recent life page', () => {
  beforeEach(() => {
    mockGetRecentLife.mockReset();
    resetStartupBrandForTests();
  });

  it('shares one date heading for several records on the same day', async () => {
    mockGetRecentLife.mockResolvedValue(
      life([
        item('moment_one', '门口的风', '9月27日', new Date(2026, 8, 27, 10).toISOString(), '2026-09-27'),
        item('moment_two', '同一天的第二句', '9月27日', new Date(2026, 8, 27, 16).toISOString(), '2026-09-27'),
        item('moment_older', '更早的一句', '9月24日', new Date(2026, 8, 24, 12).toISOString(), '2026-09-24'),
      ]),
    );
    const view = await render(wrap(<RecentScreen />));
    await waitFor(() => {
      expect(view.getByText('门口的风')).toBeTruthy();
    });
    expect(view.getAllByText('记录于 9月27日')).toHaveLength(1);
    expect(view.getByLabelText('记录于 9月27日，2条记录')).toBeTruthy();
    expect(view.getByText('同一天的第二句')).toBeTruthy();
    expect(view.getByText('记录于 9月24日')).toBeTruthy();
    expect(view.getByLabelText('留下')).toBeTruthy();
    expect(view.getByLabelText('回看')).toBeTruthy();
    expect(view.getByLabelText('最近')).toBeTruthy();
    expect(view.queryByTestId('recent-day-rule-moment_one')).toBeNull();
    expect(view.getByTestId('recent-day-rule-moment_two')).toBeTruthy();
    expect(view.queryByTestId('recent-day-rule-moment_older')).toBeNull();
  });

  it('keeps last year’s same month-day on its own heading', async () => {
    mockGetRecentLife.mockResolvedValue(
      life([
        item('moment_this', '今年的一句', '9月27日', new Date(2026, 8, 27, 10).toISOString(), '2026-09-27'),
        item('moment_last', '去年的一句', '2025年9月27日', new Date(2025, 8, 27, 10).toISOString(), '2025-09-27'),
      ]),
    );
    const view = await render(wrap(<RecentScreen />));
    await waitFor(() => {
      expect(view.getByText('今年的一句')).toBeTruthy();
    });
    expect(view.getByText('去年的一句')).toBeTruthy();
    expect(view.getByLabelText('记录于 9月27日，1条记录')).toBeTruthy();
    expect(view.getByLabelText('记录于 2025年9月27日，1条记录')).toBeTruthy();
  });

  it('shows a confirmed occurrence under the recorded-day heading', async () => {
    mockGetRecentLife.mockResolvedValue(
      life([
        item(
          'moment_later',
          '门口的风',
          '9月27日',
          new Date(2026, 8, 27, 10).toISOString(),
          '2026-09-27',
          '发生于 2026年9月24日',
        ),
        item(
          'moment_unsure',
          '想不起来哪天',
          '9月27日',
          new Date(2026, 8, 27, 16).toISOString(),
          '2026-09-27',
        ),
      ]),
    );
    const view = await render(wrap(<RecentScreen />));
    await waitFor(() => {
      expect(view.getByText('门口的风')).toBeTruthy();
    });
    expect(view.getByLabelText('记录于 9月27日，2条记录')).toBeTruthy();
    expect(view.getByText('发生于 2026年9月24日')).toBeTruthy();
    expect(view.getByLabelText(/记录于 9月27日，发生于 2026年9月24日，门口的风/)).toBeTruthy();
    expect(view.getByText('想不起来哪天')).toBeTruthy();
    expect(view.queryByTestId('recent-occurred-moment_unsure')).toBeNull();
    expect(view.queryByText('发生于 2026年9月27日')).toBeNull();
  });

  it('keeps a read error without inventing records', async () => {
    mockGetRecentLife.mockRejectedValue(new Error('disk'));
    const view = await render(wrap(<RecentScreen />));
    expect(view.getByTestId('startup-brand-layer')).toBeTruthy();
    await waitFor(() => {
      expect(view.getByText('最近的记录暂时读不出来，原来的内容还在这台设备上。')).toBeTruthy();
    });
    expect(view.getByLabelText('最近')).toBeTruthy();
    expect(view.queryByTestId(/recent-item-/)).toBeNull();
    fireEvent.press(view.getByTestId('startup-brand-skip'));
    await waitFor(() => {
      expect(view.queryByTestId('startup-brand-layer')).toBeNull();
    });
    expect(view.getByText('最近的记录暂时读不出来，原来的内容还在这台设备上。')).toBeTruthy();
  });

  it('leaves the brand layer without a tap when getRecentLife never resolves', async () => {
    setBrandReadyTimeoutForTests(200);
    mockGetRecentLife.mockReturnValue(new Promise(() => undefined));
    const view = await render(wrap(<RecentScreen />));
    expect(view.getByTestId('startup-brand-layer')).toBeTruthy();
    expect(view.getByLabelText('最近')).toBeTruthy();
    expect(view.queryByTestId(/recent-item-/)).toBeNull();
    await waitFor(() => {
      expect(view.queryByTestId('startup-brand-layer')).toBeNull();
    });
    expect(view.getByLabelText('最近')).toBeTruthy();
    expect(view.queryByTestId(/recent-item-/)).toBeNull();
    view.unmount();
    const resumed = await render(wrap(<RecentScreen />));
    expect(resumed.queryByTestId('startup-brand-layer')).toBeNull();
    expect(resumed.getByLabelText('最近')).toBeTruthy();
    resumed.unmount();
  });

  it('still paints recent life after the brand layer has timed out', async () => {
    setBrandReadyTimeoutForTests(200);
    let finishRead: (value: ReturnType<typeof life>) => void = () => undefined;
    mockGetRecentLife.mockReturnValue(
      new Promise((resolve) => {
        finishRead = resolve;
      }),
    );
    const view = await render(wrap(<RecentScreen />));
    await waitFor(() => {
      expect(view.queryByTestId('startup-brand-layer')).toBeNull();
    });
    expect(view.queryByText('门口的风')).toBeNull();
    finishRead(
      life([item('moment_late', '门口的风', '9月27日', new Date(2026, 8, 27, 10).toISOString(), '2026-09-27')]),
    );
    await waitFor(() => {
      expect(view.getByText('门口的风')).toBeTruthy();
    });
    expect(view.queryByTestId('startup-brand-layer')).toBeNull();
  });
});
