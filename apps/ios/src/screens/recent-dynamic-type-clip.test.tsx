import { StyleSheet } from 'react-native';

import { LookThisHit } from './life-icons';
import { MomentAudio } from './moment-audio';
import { render } from '@testing-library/react-native';

/**
 * Lookback excerpts sit in a plain View and omit lineHeight on the note.
 * Recent reused the same audio / 看这条 styles but wrapped them in Animated.View
 * and kept fixed line boxes that do not grow with Dynamic Type.
 */
describe('recent vs lookback type boxes', () => {
  it('keeps Recent audio and 看这条 off a fixed lineHeight', async () => {
    const audio = await render(
      <MomentAudio
        audio={{
          id: 'clip',
          status: 'available',
          uri: 'file://a.m4a',
          durationMs: 1000,
          durationLabel: '1秒',
          label: '当时的声音',
        }}
        onPlay={() => undefined}
        testIDPrefix="recent"
        scene
        markedActions
      />,
    );
    expect(StyleSheet.flatten(audio.getByText('当时的声音').props.style).lineHeight).toBeUndefined();
    expect(StyleSheet.flatten(audio.getByText('一段声音 · 1秒').props.style).lineHeight).toBeUndefined();
    expect(StyleSheet.flatten(audio.getByText('播放').props.style).lineHeight).toBeUndefined();

    const open = await render(
      <LookThisHit caption="看这条" accessibilityLabel="看这条" testID="recent-open-x" onPress={() => undefined} />,
    );
    expect(StyleSheet.flatten(open.getByTestId('recent-open-label-x').props.style).lineHeight).toBeUndefined();
    expect(StyleSheet.flatten(open.getByTestId('recent-open-x').props.style).overflow).toBe('visible');
  });
});
