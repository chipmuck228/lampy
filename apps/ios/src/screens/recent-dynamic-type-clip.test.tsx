import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { LookThisHit } from './life-icons';
import { MomentAudio } from './moment-audio';

describe('fixed type on recent reading controls', () => {
  it('keeps Recent audio and 看这条 on the app type scale', async () => {
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
    expect(audio.getByText('当时的声音').props.allowFontScaling).toBe(false);
    expect(audio.getByText('一段声音 · 1秒').props.allowFontScaling).toBe(false);
    expect(audio.getByText('播放').props.allowFontScaling).toBe(false);
    expect(StyleSheet.flatten(audio.getByText('播放').props.style).fontSize).toBe(17);

    const open = await render(
      <LookThisHit caption="看这条" accessibilityLabel="看这条" testID="recent-open-x" onPress={() => undefined} />,
    );
    expect(open.getByTestId('recent-open-label-x').props.allowFontScaling).toBe(false);
    expect(StyleSheet.flatten(open.getByTestId('recent-open-label-x').props.style).fontSize).toBe(17);
    expect(StyleSheet.flatten(open.getByTestId('recent-open-x').props.style).overflow).toBe('visible');
  });
});
