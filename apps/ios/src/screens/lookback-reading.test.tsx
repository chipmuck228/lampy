import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { LookbackDayEntry } from '../application/lookback-day';
import type { LookbackPlacedDay } from '../application/lookback-reading';
import { LookbackReadingHeader, LookbackReadingMoment, LookbackReadingNeighbors } from './lookback-reading';

const longNote = [
  '傍晚回家，楼道里还留着白天的热。',
  '门开了一半，桌上的杯子没洗。',
  '我把窗户推开一点，听见楼下有人在说话，听不清在说什么。',
  '后来就坐了一会儿。',
  '没有特别要记下的事，只是这一天走到这里。',
  '杯子沿上还有一圈水渍。',
  '风停了之后，房间重新安静下来。',
  '我想着明天再把桌子擦一下。',
  '先把这一刻留下来。',
].join('\n');

function collectTestIDs(node: unknown): string[] {
  const ids: string[] = [];
  function walk(current: unknown) {
    if (!current || typeof current !== 'object') return;
    const next = current as { props?: { testID?: string }; children?: unknown };
    if (typeof next.props?.testID === 'string') ids.push(next.props.testID);
    const children = next.children;
    if (Array.isArray(children)) children.forEach(walk);
    else walk(children);
  }
  walk(node);
  return ids;
}

function entry(partial: Partial<LookbackDayEntry> = {}): LookbackDayEntry {
  return {
    id: 'm_mix',
    clockLabel: null,
    note: '短句',
    recordedLabel: null,
    feeling: null,
    images: [],
    audio: null,
    unknownMedia: [],
    ...partial,
  };
}

describe('lookback reading header', () => {
  it('stacks year, month-day, and weekday with the real count', async () => {
    const view = await render(<LookbackReadingHeader year={2026} month={9} day={18} count={3} />);
    expect(view.getByTestId('lookback-reading-year').props.children).toBe('2026');
    expect(view.getByTestId('lookback-reading-title').props.children).toBe('9月18日');
    expect(view.getByTestId('lookback-reading-meta').props.children).toBe('周五 · 3条记录');
    expect(view.getByLabelText('2026年9月18日，星期五，3条')).toBeTruthy();
    expect(view.queryByText('2026年9月18日')).toBeNull();
  });
});

describe('lookback reading moment', () => {
  it('keeps the exact moment id on the full-record action', async () => {
    const onOpen = jest.fn();
    const view = await render(
      <LookbackReadingMoment
        entry={entry()}
        pairImages={false}
        expanded={false}
        listen={{ status: 'idle', currentTimeMs: 0 }}
        onToggleExpand={() => undefined}
        onOpen={onOpen}
        onPlay={() => undefined}
        onPause={() => undefined}
      />,
    );
    fireEvent.press(view.getByTestId('lookback-book-open-m_mix'));
    expect(onOpen).toHaveBeenCalledWith('m_mix');
  });

  it('expands a long note in place and still offers the full record', async () => {
    const onToggle = jest.fn();
    const view = await render(
      <LookbackReadingMoment
        entry={entry({ note: longNote })}
        pairImages={false}
        expanded={false}
        listen={{ status: 'idle', currentTimeMs: 0 }}
        onToggleExpand={onToggle}
        onOpen={() => undefined}
        onPlay={() => undefined}
        onPause={() => undefined}
      />,
    );
    const measure = view.getByTestId('lookback-reading-note-measure-m_mix', { includeHiddenElements: true });
    await act(async () => {
      measure.props.onTextLayout({
        nativeEvent: { lines: Array.from({ length: 9 }, () => ({ text: 'line' })) },
      });
    });
    expect(view.getByLabelText('展开正文')).toBeTruthy();
    expect(view.getByText('阅读完整记录')).toBeTruthy();
    fireEvent.press(view.getByTestId('lookback-reading-expand-m_mix'));
    expect(onToggle).toHaveBeenCalled();
  });

  it('keeps expand with the note, before photos and the full-record action', async () => {
    const view = await render(
      <LookbackReadingMoment
        entry={entry({
          note: longNote,
          images: [
            {
              id: 'a',
              status: 'available',
              uri: 'memory://a.jpg',
              width: 800,
              height: 600,
              label: '照片 1/1',
            },
          ],
          audio: {
            id: 'clip_a',
            status: 'available',
            uri: 'memory://a.m4a',
            durationMs: 4000,
            durationLabel: '4秒',
            label: '当时的声音',
          },
          feeling: { value: '平静', label: '平静', known: true },
        })}
        pairImages={false}
        expanded={false}
        listen={{ status: 'idle', currentTimeMs: 0 }}
        onToggleExpand={() => undefined}
        onOpen={() => undefined}
        onPlay={() => undefined}
        onPause={() => undefined}
      />,
    );
    const measure = view.getByTestId('lookback-reading-note-measure-m_mix', { includeHiddenElements: true });
    await act(async () => {
      measure.props.onTextLayout({
        nativeEvent: { lines: Array.from({ length: 9 }, () => ({ text: 'line' })) },
      });
    });
    const order = collectTestIDs(view.toJSON()).filter((id) =>
      [
        'lookback-reading-note-m_mix',
        'lookback-reading-expand-m_mix',
        'lookback-reading-image-m_mix-a',
        'lookback-reading-sound-m_mix-play-clip_a',
        'lookback-reading-feeling-m_mix',
        'lookback-book-open-m_mix',
      ].includes(id),
    );
    expect(order).toEqual([
      'lookback-reading-note-m_mix',
      'lookback-reading-expand-m_mix',
      'lookback-reading-image-m_mix-a',
      'lookback-reading-sound-m_mix-play-clip_a',
      'lookback-reading-feeling-m_mix',
      'lookback-book-open-m_mix',
    ]);
  });

  it('shows every photo and a missing placeholder without inventing a crop', async () => {
    const view = await render(
      <LookbackReadingMoment
        entry={entry({
          images: [
            {
              id: 'a',
              status: 'available',
              uri: 'memory://a.jpg',
              width: 800,
              height: 600,
              label: '照片 1/2',
            },
            {
              id: 'b',
              status: 'unavailable',
              label: '这张照片暂时找不到了，但这条记录还在。',
            },
          ],
        })}
        pairImages={false}
        expanded={false}
        listen={{ status: 'idle', currentTimeMs: 0 }}
        onToggleExpand={() => undefined}
        onOpen={() => undefined}
        onPlay={() => undefined}
        onPause={() => undefined}
      />,
    );
    expect(view.getByTestId('lookback-reading-image-m_mix-a')).toBeTruthy();
    expect(view.getByText('这张照片暂时找不到了，但这条记录还在。')).toBeTruthy();
  });
});

const current = { year: 2026, month: 9, day: 27 };
const previousDay: LookbackPlacedDay = { year: 2026, month: 9, day: 24, count: 2 };
const nextDay: LookbackPlacedDay = { year: 2026, month: 9, day: 28, count: 1 };

async function renderNeighbors(onOpen = jest.fn()) {
  return {
    onOpen,
    view: await render(
      <LookbackReadingNeighbors current={current} previous={previousDay} next={nextDay} onOpen={onOpen} />,
    ),
  };
}

describe('lookback reading neighbors', () => {
  it('keeps previous and next side by side, with the date under each verb', async () => {
    const { view, onOpen } = await renderNeighbors();
    expect(StyleSheet.flatten(view.getByTestId('lookback-reading-neighbors').props.style).flexDirection).toBe(
      'row',
    );
    expect(StyleSheet.flatten(view.getByTestId('lookback-reading-neighbors').props.style).flexWrap).toBe(
      'nowrap',
    );
    expect(view.getByText('前一个记录日')).toBeTruthy();
    expect(view.getByText('9月24日')).toBeTruthy();
    expect(view.getByText('后一个记录日')).toBeTruthy();
    expect(view.getByText('9月28日')).toBeTruthy();
    expect(view.queryByText('前一个有记录日 · 9月24日')).toBeNull();
    const previous = view.getByText('前一个记录日');
    expect(previous.props.allowFontScaling).toBe(false);
    expect(previous.props.maxFontSizeMultiplier).toBe(1);
    expect(view.getByText('9月24日').props.allowFontScaling).toBe(false);
    expect(StyleSheet.flatten(view.getByTestId('lookback-reading-prev-day').props.style).minHeight).toBe(48);
    expect(StyleSheet.flatten(view.getByTestId('lookback-reading-prev-day').props.style).flex).toBe(1);
    expect(collectTestIDs(view.toJSON()).filter((id) => id.endsWith('-day'))).toEqual([
      'lookback-reading-prev-day',
      'lookback-reading-next-day',
    ]);
    fireEvent.press(view.getByTestId('lookback-reading-prev-day'));
    fireEvent.press(view.getByTestId('lookback-reading-next-day'));
    expect(onOpen.mock.calls).toEqual([[previousDay], [nextDay]]);
  });
});
