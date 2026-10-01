import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';

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
    images: [
      {
        id: 'img_keep',
        status: 'available',
        uri: 'memory://assets/keep.jpg',
        width: 900,
        height: 1200,
        label: '门口',
      },
    ],
    audio: {
      id: 'clip_keep',
      status: 'available',
      uri: 'memory://audio/keep.m4a',
      durationMs: 1200,
      durationLabel: '1秒',
      label: '一段声音',
    },
    unknownMedia: [],
    ...partial,
  };
}

const idle = { status: 'idle' as const, currentTimeMs: 0 };
const echoOpacity = new Animated.Value(1);

describe('recent moment row', () => {
  it('clamps the visible note until a short measure drops the limit', async () => {
    const view = await render(
      <RecentMoment
        item={item({ id: 'moment_short', note: '门口的风还在。' })}
        pairImages={false}
        echoOpacity={new Animated.Value(1)}
        listen={idle}
        onOpen={() => undefined}
        onPlay={() => undefined}
        onPause={() => undefined}
      />,
    );
    expect(view.getByTestId('recent-note-moment_short').props.numberOfLines).toBe(6);
    expect(view.getByTestId('recent-open-label-moment_short').props.children).toBe('阅读完整记录');
    fireEvent(view.getByTestId('recent-note-measure-moment_short', { includeHiddenElements: true }), 'textLayout', {
      nativeEvent: { lines: Array.from({ length: 3 }, () => ({ text: 'line' })) },
    });
    await waitFor(() => {
      expect(view.getByTestId('recent-note-moment_short').props.numberOfLines).toBeUndefined();
    });
    fireEvent(view.getByTestId('recent-note-measure-moment_short', { includeHiddenElements: true }), 'textLayout', {
      nativeEvent: { lines: Array.from({ length: 7 }, () => ({ text: 'line' })) },
    });
    await waitFor(() => {
      expect(view.getByTestId('recent-note-moment_short').props.numberOfLines).toBe(6);
      expect(view.getByTestId('recent-open-label-moment_short').props.children).toBe('阅读完整记录');
      expect(view.getByLabelText('展开正文')).toBeTruthy();
    });
  });

  it('keeps the same shell when echo starts, and holds local note measure', async () => {
    const props = {
      item: item({ id: 'moment_keep', note: '门口的风还在。' }),
      pairImages: false,
      echoOpacity,
      listen: idle,
      onOpen: () => undefined,
      onPlay: () => undefined,
      onPause: () => undefined,
    };
    const view = await render(<RecentMoment {...props} echoing={false} />);
    expect(view.getByTestId('recent-shell-moment_keep')).toBeTruthy();
    expect(view.queryByTestId('recent-echo-moment_keep')).toBeNull();
    fireEvent(view.getByTestId('recent-note-measure-moment_keep', { includeHiddenElements: true }), 'textLayout', {
      nativeEvent: { lines: Array.from({ length: 3 }, () => ({ text: 'line' })) },
    });
    await waitFor(() => {
      expect(view.getByTestId('recent-note-moment_keep').props.numberOfLines).toBeUndefined();
    });
    expect(view.getByTestId('recent-image-moment_keep-frame-img_keep')).toBeTruthy();
    expect(view.getByTestId('recent-sound-moment_keep-play-clip_keep')).toBeTruthy();

    await view.rerender(<RecentMoment {...props} echoing />);
    expect(view.getByTestId('recent-echo-moment_keep')).toBeTruthy();
    expect(view.getByTestId('recent-note-moment_keep').props.numberOfLines).toBeUndefined();
    expect(view.getByTestId('recent-image-moment_keep-frame-img_keep')).toBeTruthy();
    expect(view.getByTestId('recent-sound-moment_keep-play-clip_keep')).toBeTruthy();
  });

  it('marks the just-saved row when echoing is on', async () => {
    const view = await render(
      <RecentMoment
        item={item({ id: 'moment_late', note: '门口的风' })}
        pairImages={false}
        echoOpacity={new Animated.Value(1)}
        echoing
        listen={idle}
        onOpen={() => undefined}
        onPlay={() => undefined}
        onPause={() => undefined}
      />,
    );
    expect(view.getByTestId('recent-echo-moment_late')).toBeTruthy();
    expect(view.getByTestId('recent-note-moment_late')).toBeTruthy();
  });

  it('keeps Recent note and clock on the fixed app type scale and hides occurred dates', async () => {
    const view = await render(
      <RecentMoment
        item={item({
          id: 'moment_type',
          note: '门口的风还在。',
          occurredLabel: '发生于 9月28日',
        })}
        pairImages={false}
        echoOpacity={new Animated.Value(1)}
        listen={idle}
        onOpen={() => undefined}
        onPlay={() => undefined}
        onPause={() => undefined}
      />,
    );
    const shell = StyleSheet.flatten(view.getByTestId('recent-shell-moment_type').props.style);
    expect(shell.overflow).toBe('visible');
    expect(StyleSheet.flatten(view.getByTestId('recent-fade-moment_type').props.style).overflow).not.toBe(
      'visible',
    );
    expect(StyleSheet.flatten(view.getByTestId('recent-note-moment_type').props.style).fontSize).toBe(17);
    expect(StyleSheet.flatten(view.getByTestId('recent-note-moment_type').props.style).lineHeight).toBe(35);
    expect(StyleSheet.flatten(view.getByTestId('recent-clock-moment_type').props.style).fontSize).toBe(13);
    expect(view.getByTestId('recent-note-moment_type').props.allowFontScaling).toBe(false);
    expect(view.getByTestId('recent-clock-moment_type').props.allowFontScaling).toBe(false);
    expect(view.queryByText('发生于 9月28日')).toBeNull();
    expect(view.queryByTestId('recent-occurred-moment_type')).toBeNull();
    expect(StyleSheet.flatten(view.getByTestId('recent-image-pause-moment_type').props.style).marginTop).toBe(22);
  });

  it('keeps expand with the note, before photos and the full-record action', async () => {
    const onToggle = jest.fn();
    const view = await render(
      <RecentMoment
        item={item({
          id: 'moment_order',
          note: ['一行', '二行', '三行', '四行', '五行', '六行', '七行'].join('\n'),
        })}
        pairImages={false}
        echoOpacity={new Animated.Value(1)}
        listen={idle}
        onToggleExpand={onToggle}
        onOpen={() => undefined}
        onPlay={() => undefined}
        onPause={() => undefined}
      />,
    );
    fireEvent(view.getByTestId('recent-note-measure-moment_order', { includeHiddenElements: true }), 'textLayout', {
      nativeEvent: { lines: Array.from({ length: 7 }, () => ({ text: 'line' })) },
    });
    await waitFor(() => {
      expect(view.getByTestId('recent-expand-moment_order')).toBeTruthy();
    });
    const ids: string[] = [];
    function walk(node: unknown) {
      if (!node || typeof node !== 'object') return;
      const next = node as { props?: { testID?: string }; children?: unknown };
      if (typeof next.props?.testID === 'string') ids.push(next.props.testID);
      const children = next.children;
      if (Array.isArray(children)) children.forEach(walk);
      else walk(children);
    }
    walk(view.toJSON());
    const order = ids.filter((id) =>
      [
        'recent-note-moment_order',
        'recent-expand-moment_order',
        'recent-image-moment_order-img_keep',
        'recent-sound-moment_order-play-clip_keep',
        'recent-open-moment_order',
      ].includes(id),
    );
    expect(order).toEqual([
      'recent-note-moment_order',
      'recent-expand-moment_order',
      'recent-image-moment_order-img_keep',
      'recent-sound-moment_order-play-clip_keep',
      'recent-open-moment_order',
    ]);
    fireEvent.press(view.getByTestId('recent-expand-moment_order'));
    expect(onToggle).toHaveBeenCalled();
  });
});
