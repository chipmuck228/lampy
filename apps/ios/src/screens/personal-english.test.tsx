import { Animated } from 'react-native';
import { RecentMoment } from './recent-moment';
import type { RecentLifeItem } from '../application/use-cases';
import { fireEvent, render } from '@testing-library/react-native';
import { FeelingPicker, MomentFeeling } from './moment-feeling';
import { LookbackReadingHeader } from './lookback-reading';
import { recordedDayForRecent } from '../application/recent-life';
import { projectMomentDetailView } from '../domain-adapters/moment-detail-projection';
import { formatCalendarDate } from '../domain-adapters/calendar';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));

it('shows English choices but writes original feeling values and preserves old words', async () => {
  const onChange = jest.fn();
  const ui = await render(<FeelingPicker value="" onChange={onChange} />);
  await fireEvent.press(ui.getByText('Calm'));
  expect(onChange).toHaveBeenCalledWith('平静');
  await ui.rerender(<FeelingPicker value="平静" onChange={onChange} />);
  expect(ui.getByText('Calm')).toBeTruthy();
  await ui.rerender(<MomentFeeling feeling={{ value: '从前的词', label: '从前的词', known: false }} />);
  expect(ui.getByLabelText('Feeling, 从前的词')).toBeTruthy();
});
it('reads a full English date and a singular count', async () => {
  const ui = await render(<LookbackReadingHeader year={2026} month={9} day={18} count={1} />);
  expect(ui.getByText('Sep 18')).toBeTruthy();
  expect(ui.getByLabelText('Sep 18, 2026, Friday, 1 moment')).toBeTruthy();
});
it('keeps placement keys and respects precision and the existing viewer offset', () => {
  expect(recordedDayForRecent('2026-09-18T23:30:00Z', new Date('2026-09-19'), 480)).toEqual({ dayKey: '2026-09-19', dayLabel: 'Sep 19' });
  expect(formatCalendarDate('2026-09-18T23:30:00Z', 'day', 480)).toBe('Sep 19, 2026');
  expect(formatCalendarDate('2026-09-18T23:30:00Z', 'month', 480)).toBe('Sep 2026');
  expect(formatCalendarDate('', 'unknown', 480)).toBe('Date uncertain');
  const note = '今天很平静。This is my own text.';
  const source = { id: 'moment_english', revision: 1, status: 'active', time: { recordedAt: '2026-09-18T12:00:00Z', occurredAt: '', occurredAtPrecision: 'unknown' }, content: { note, emotion: '平静' }, origin: { type: 'created' }, assetIds: [] };
  const view = projectMomentDetailView(source, [], { timezoneOffsetMinutes: 480 });
  expect(view.content.note).toBe(note);
  expect(source.content.emotion).toBe('平静');
  expect(view.displayDate.primary).toBe('Recorded Sep 18, 2026');
});

it('keeps playback and opening separate, retaining the user text on rerender', async () => {
  const onOpen = jest.fn(), onPlay = jest.fn(), onPause = jest.fn();
  const item: RecentLifeItem = {
    id: 'english_moment', note: '回看是一段原文。', recordedAt: '2026-09-18T12:00:00Z',
    dayKey: '2026-09-18', dayLabel: 'Sep 18', dateLabel: 'Sep 18', occurredLabel: null,
    feeling: { value: '平静', label: '平静', known: true }, images: [],
    audio: { id: 'asset_voice', label: 'Sound from that moment', status: 'available', uri: 'file:///voice.m4a', durationMs: 5000, durationLabel: '5 sec' },
    unknownMedia: [],
  };
  const props = { item, pairImages: false, echoOpacity: new Animated.Value(1), onOpen, onPlay, onPause };
  const ui = await render(<RecentMoment {...props} listen={{ status: 'idle', currentTimeMs: 0 }} />);
  await fireEvent.press(ui.getByLabelText(/^Play，/));
  expect(onPlay).toHaveBeenCalledTimes(1);
  expect(onOpen).not.toHaveBeenCalled();
  await ui.rerender(<RecentMoment {...props} listen={{ status: 'playing', currentTimeMs: 2000 }} />);
  await fireEvent.press(ui.getByLabelText(/^Pause，/));
  expect(onPause).toHaveBeenCalledTimes(1);
  expect(ui.getByTestId('recent-note-english_moment').props.children).toBe(item.note);
  expect(ui.getByText('Calm')).toBeTruthy();
});
