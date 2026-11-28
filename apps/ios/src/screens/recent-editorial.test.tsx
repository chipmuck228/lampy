import { render, fireEvent } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';
import type { ImageView, RecentLifeItem } from '../application/use-cases';
import { RecentMoment } from './recent-moment';
import { recentEditorialImageSize } from './recent-editorial-photos';

const photo = (id: string, width = 1600, height = 1000): ImageView => ({
  id, width, height, status: 'available', uri: `memory://${id}.jpg`, label: id,
});
const record = (images: ImageView[], note = '在这场比赛中他们将获得冠军'): RecentLifeItem => ({
  id: 'ipad', note, images, audio: null, unknownMedia: [], feeling: null,
  recordedAt: '2026-09-30T20:45:00.000Z', dayKey: '2026-09-30',
  dayLabel: '9月30日', dateLabel: '9月30日', occurredLabel: null,
});
const props = {
  pairImages: true, echoOpacity: new Animated.Value(1),
  listen: { status: 'idle' as const, currentTimeMs: 0 },
  onOpen: jest.fn(), onPlay: jest.fn(), onPause: jest.fn(), reduceMotion: true,
};

it.each([[1600, 1000], [600, 1800], [4000, 100], [100, 4000]])(
  'fits the complete %sx%s photo within both editorial dimensions', (width, height) => {
    const fitted = recentEditorialImageSize(photo('fit', width, height), 450, 300);
    expect(fitted.width).toBeLessThanOrEqual(450);
    expect(fitted.height).toBeLessThanOrEqual(300);
    expect(fitted.width / fitted.height).toBeCloseTo(width / height);
  },
);
it('places two real photos beside the note instead of stacking screen-height photos', async () => {
  const view = await render(<RecentMoment {...props} editorial imageMaxHeight={300}
    item={record([photo('leaf'), photo('flower')])} />);
  expect(StyleSheet.flatten(view.getByTestId('recent-body-ipad').props.style).flexDirection).toBe('row-reverse');
  await fireEvent(view.getByTestId('recent-image-ipad-wall'), 'layout', {
    nativeEvent: { layout: { width: 500, height: 200, x: 0, y: 0 } },
  });
  for (const id of ['leaf', 'flower']) {
    expect(view.getByTestId(`recent-image-ipad-${id}`).props.contentFit).toBe('contain');
    const frame = StyleSheet.flatten(view.getByTestId(`recent-image-ipad-frame-${id}`).props.style);
    expect(frame.height).toBeLessThanOrEqual(300);
    expect(frame.width).toBeLessThanOrEqual(244);
  }
  expect(view.getByTestId('recent-note-ipad').props.children).toBe('在这场比赛中他们将获得冠军');
});
it('preserves a missing photo and all three ordered image slots in the wall', async () => {
  const missing: ImageView = { id: 'missing', status: 'unavailable', label: '第三张', unavailableLabel: '暂时找不到' };
  const view = await render(<RecentMoment {...props} editorial item={record([photo('a'), photo('b'), missing])} />);
  expect(view.getByTestId('recent-image-ipad-tile-a')).toBeTruthy();
  expect(view.getByTestId('recent-image-ipad-tile-b')).toBeTruthy();
  expect(view.getByTestId('recent-image-ipad-unavailable-missing')).toBeTruthy();
  expect(view.getByTestId('recent-image-ipad-tile-a').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: '100%' })]));
});
it('keeps image-only records full-width and keeps long text expandable', async () => {
  const view = await render(<RecentMoment {...props} editorial item={record([photo('a')], '')} />);
  expect(view.queryByTestId('recent-note-ipad')).toBeNull();
  await view.rerender(<RecentMoment {...props} editorial expanded item={record([photo('a')], '长文'.repeat(120))} />);
  await fireEvent(view.getByTestId('recent-note-measure-ipad', { includeHiddenElements: true }), 'textLayout', {
    nativeEvent: { lines: Array.from({ length: 12 }, () => ({ text: '正文' })) },
  });
  expect(view.getByTestId('recent-note-ipad').props.numberOfLines).toBeUndefined();
  expect(view.getByTestId('recent-expand-ipad')).toBeTruthy();
  await view.rerender(<RecentMoment {...props} item={record([photo('a')])} />);
  expect(view.queryByTestId('recent-image-ipad-wall')).toBeNull();
  expect(StyleSheet.flatten(view.getByTestId('recent-note-ipad').props.style).fontSize).toBe(17);
});
