import { act, fireEvent, render } from '@testing-library/react-native';

import type { LookbackDayEntry } from '../application/lookback-day';
import { LookbackReadingMoment } from './lookback-reading';

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
