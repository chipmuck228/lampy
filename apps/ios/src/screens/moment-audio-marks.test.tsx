import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { hairline } from './life-page';
import { MomentAudio, shouldShowHeardProgress } from './moment-audio';

const audio = {
  id: 'asset_voice',
  status: 'available' as const,
  uri: 'file://a.m4a',
  durationMs: 3500,
  durationLabel: '4秒',
  label: '当时的声音',
};

describe('MomentAudio action marks', () => {
  it('keeps play as words only unless the caller asks for marks', async () => {
    const plain = await render(
      <MomentAudio audio={audio} onPlay={() => undefined} onPause={() => undefined} testIDPrefix="plain" />,
    );
    expect(plain.getByLabelText('播放，4秒')).toBeTruthy();
    expect(plain.queryByTestId('plain-mark-asset_voice')).toBeNull();

    const marked = await render(
      <MomentAudio
        audio={audio}
        onPlay={() => undefined}
        onPause={() => undefined}
        testIDPrefix="marked"
        markedActions
      />,
    );
    expect(marked.getByLabelText('播放，4秒')).toBeTruthy();
    expect(marked.getByTestId('marked-mark-asset_voice')).toBeTruthy();
    expect(StyleSheet.flatten(marked.getByText('播放').props.style).fontSize).toBe(17);
    expect(marked.getByText('播放').props.allowFontScaling).toBe(false);
  });

  it('keeps scene and compact copy on the fixed app type scale', async () => {
    const scene = await render(
      <MomentAudio audio={audio} testIDPrefix="scene" scene />,
    );
    expect(StyleSheet.flatten(scene.getByTestId('scene-scene-asset_voice').props.style).fontSize).toBe(17);
    expect(StyleSheet.flatten(scene.getByText('一段声音 · 4秒').props.style).fontSize).toBe(15);
    expect(scene.getByText('一段声音 · 4秒').props.allowFontScaling).toBe(false);

    const compact = await render(
      <MomentAudio audio={audio} testIDPrefix="compact" compact />,
    );
    expect(StyleSheet.flatten(compact.getByText('一段声音 · 4秒').props.style).fontSize).toBe(15);
    expect(compact.getByText('一段声音 · 4秒').props.allowFontScaling).toBe(false);
  });

  it('hides the empty idle track when Recent asks for heard progress only', async () => {
    const idle = await render(
      <MomentAudio audio={audio} playbackStatus="idle" testIDPrefix="recent" scene progressWhenHeard />,
    );
    expect(idle.queryByTestId('recent-progress-asset_voice')).toBeNull();

    const preparing = await render(
      <MomentAudio audio={audio} playbackStatus="preparing" testIDPrefix="prep" scene progressWhenHeard />,
    );
    expect(preparing.queryByTestId('prep-progress-asset_voice')).toBeNull();

    const finished = await render(
      <MomentAudio audio={audio} playbackStatus="finished" currentTimeMs={3500} testIDPrefix="done" scene progressWhenHeard />,
    );
    expect(finished.queryByTestId('done-progress-asset_voice')).toBeNull();
    expect(finished.getByText('已播完 · 4秒')).toBeTruthy();
  });

  it('shows a heard track that is not the 72pt same-day hairline', async () => {
    const playing = await render(
      <MomentAudio
        audio={audio}
        playbackStatus="playing"
        currentTimeMs={1200}
        testIDPrefix="play"
        scene
        progressWhenHeard
      />,
    );
    const playTrack = StyleSheet.flatten(playing.getByTestId('play-progress-asset_voice').props.style);
    expect(playTrack).toEqual(
      expect.objectContaining({ width: '100%', height: 3, backgroundColor: 'rgba(79,98,109,0.18)' }),
    );
    expect(playTrack.backgroundColor).not.toBe(hairline);
    expect(playTrack.width).not.toBe(72);

    const paused = await render(
      <MomentAudio
        audio={audio}
        playbackStatus="paused"
        currentTimeMs={800}
        testIDPrefix="pause"
        scene
        progressWhenHeard
      />,
    );
    expect(paused.getByTestId('pause-progress-asset_voice')).toBeTruthy();
    expect(
      StyleSheet.flatten(paused.getByTestId('pause-progress-asset_voice').props.children.props.style),
    ).toEqual(expect.objectContaining({ width: '23%' }));
  });

  it('shows heard progress on compact Recent sound without the scene title', async () => {
    const idle = await render(
      <MomentAudio audio={audio} playbackStatus="idle" testIDPrefix="voice-idle" compact progressWhenHeard />,
    );
    expect(idle.queryByTestId('voice-idle-progress-asset_voice')).toBeNull();
    expect(idle.queryByTestId('voice-idle-scene-asset_voice')).toBeNull();
    expect(idle.getByText('一段声音 · 4秒')).toBeTruthy();

    const playing = await render(
      <MomentAudio
        audio={audio}
        playbackStatus="playing"
        currentTimeMs={1200}
        testIDPrefix="voice-play"
        compact
        progressWhenHeard
      />,
    );
    expect(playing.queryByTestId('voice-play-scene-asset_voice')).toBeNull();
    expect(playing.getByText('正在播放 · 1秒 / 4秒')).toBeTruthy();
    expect(StyleSheet.flatten(playing.getByTestId('voice-play-progress-asset_voice').props.style)).toEqual(
      expect.objectContaining({ width: '100%', height: 3, backgroundColor: 'rgba(79,98,109,0.18)' }),
    );

    const paused = await render(
      <MomentAudio
        audio={audio}
        playbackStatus="paused"
        currentTimeMs={800}
        testIDPrefix="voice-pause"
        compact
        progressWhenHeard
      />,
    );
    expect(paused.queryByTestId('voice-pause-scene-asset_voice')).toBeNull();
    expect(paused.getByText('已暂停 · 1秒 / 4秒')).toBeTruthy();
    expect(paused.getByTestId('voice-pause-progress-asset_voice')).toBeTruthy();
    expect(
      StyleSheet.flatten(paused.getByTestId('voice-pause-progress-asset_voice').props.children.props.style),
    ).toEqual(expect.objectContaining({ width: '23%' }));
  });

  it('keeps the detail idle track when the Recent option is not passed', async () => {
    const detail = await render(<MomentAudio audio={audio} playbackStatus="idle" testIDPrefix="detail" scene />);
    expect(detail.getByTestId('detail-progress-asset_voice')).toBeTruthy();
    expect(StyleSheet.flatten(detail.getByTestId('detail-progress-asset_voice').props.style)).toEqual(
      expect.objectContaining({ width: '100%', height: 1, backgroundColor: hairline }),
    );
  });
});

describe('shouldShowHeardProgress', () => {
  it('only treats playing or a paused position as heard', () => {
    expect(shouldShowHeardProgress('idle', 0)).toBe(false);
    expect(shouldShowHeardProgress('preparing', 0)).toBe(false);
    expect(shouldShowHeardProgress('playing', 0)).toBe(true);
    expect(shouldShowHeardProgress('paused', 0)).toBe(false);
    expect(shouldShowHeardProgress('paused', 400)).toBe(true);
    expect(shouldShowHeardProgress('finished', 3500)).toBe(false);
    expect(shouldShowHeardProgress('unavailable', 0)).toBe(false);
  });
});
