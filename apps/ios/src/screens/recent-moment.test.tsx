import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Animated } from 'react-native';

import { RecentMoment } from './recent-moment';
import type { RecentLifeItem } from '../application/use-cases';

function item(partial: Partial<RecentLifeItem> & Pick<RecentLifeItem, 'id' | 'note'>): RecentLifeItem {
  return {
    recordedAt: new Date(2026, 9, 1, 10).toISOString(),
    dayKey: '2026-10-01',
    dayLabel: '10月1日',
    dateLabel: '记录于 10月1日',
    occurredLabel: null,
    feeling: null,
    images: [],
    audio: null,
    unknownMedia: [],
    ...partial,
  };
}

describe('recent moment row', () => {
  it('keeps a short note whole and only mentions more text after a real wrap', async () => {
    const view = await render(
      <RecentMoment
        item={item({ id: 'moment_short', note: '门口的风还在。' })}
        pairImages={false}
        listen={{ status: 'idle', currentTimeMs: 0 }}
        onOpen={() => undefined}
        onPlay={() => undefined}
        onPause={() => undefined}
      />,
    );
    expect(view.getByTestId('recent-note-moment_short')).toBeTruthy();
    expect(view.getByTestId('recent-open-label-moment_short').props.children).toBe('看这条');
    fireEvent(view.getByTestId('recent-note-measure-moment_short', { includeHiddenElements: true }), 'textLayout', {
      nativeEvent: { lines: Array.from({ length: 7 }, () => ({ text: 'line' })) },
    });
    await waitFor(() => {
      expect(view.getByTestId('recent-open-label-moment_short').props.children).toBe('看这条，还有正文');
    });
  });

  it('marks the just-saved row when an echo opacity is provided', async () => {
    const view = await render(
      <RecentMoment
        item={item({ id: 'moment_late', note: '门口的风' })}
        pairImages={false}
        echoOpacity={new Animated.Value(1)}
        listen={{ status: 'idle', currentTimeMs: 0 }}
        onOpen={() => undefined}
        onPlay={() => undefined}
        onPause={() => undefined}
      />,
    );
    expect(view.getByTestId('recent-echo-moment_late')).toBeTruthy();
    expect(view.getByTestId('recent-note-moment_late')).toBeTruthy();
  });
});
