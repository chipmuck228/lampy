import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';

import { createMemoryAudioPlayback } from '../infrastructure/media';
import { MomentAudio } from './moment-audio';
import { useSoundPlayer } from './use-sound-player';

const VOICE = 'file://documents/leave.m4a';

const availableAudio = {
  id: 'asset_voice',
  status: 'available' as const,
  uri: VOICE,
  durationMs: 3500,
  durationLabel: '4秒',
  label: '当时的声音',
};

function createDeferredPlayback() {
  const playback = createMemoryAudioPlayback();
  playback.deferPlaying = true;
  return playback;
}

describe('useSoundPlayer state sync', () => {
  it('keeps preparing when native play() still reports idle, then follows playing', async () => {
    const playback = createDeferredPlayback();
    const created: unknown[] = [];
    const { result } = await renderHook(() =>
      useSoundPlayer(() => {
        created.push(playback);
        return playback;
      }),
    );

    await act(async () => {
      await result.current.play(VOICE);
    });

    expect(result.current.status).toBe('preparing');
    expect(result.current.failed).toBe(false);
    expect(result.current.currentTimeMs).toBe(0);
    expect(playback.loads).toBe(1);
    expect(playback.plays).toBe(1);

    playback.reportPlaying(400);
    await waitFor(() => {
      expect(result.current.status).toBe('playing');
    });
    expect(result.current.currentTimeMs).toBe(400);
    expect(result.current.failed).toBe(false);
    expect(created).toHaveLength(1);
  });

  it('resumes a paused source without loading again or resetting time', async () => {
    const playback = createDeferredPlayback();
    const { result } = await renderHook(() => useSoundPlayer(() => playback));

    await act(async () => {
      await result.current.play(VOICE);
    });
    playback.reportPlaying(1200);
    await waitFor(() => {
      expect(result.current.status).toBe('playing');
    });

    await act(async () => {
      await result.current.pause();
    });
    expect(result.current.status).toBe('paused');
    expect(result.current.currentTimeMs).toBe(1200);
    expect(playback.loads).toBe(1);

    playback.deferPlaying = false;
    await act(async () => {
      await result.current.play(VOICE);
    });

    expect(playback.loads).toBe(1);
    expect(playback.plays).toBe(2);
    expect(result.current.status).toBe('playing');
    expect(result.current.currentTimeMs).toBe(1200);
    expect(playback.loadedUri).toBe(VOICE);
  });

  it('ignores a second tap while the same uri is still starting', async () => {
    let finishLoad: ((value?: void) => void) | undefined;
    const playback = createDeferredPlayback();
    playback.load = async (uri: string) => {
      playback.loads += 1;
      playback.loadedUri = uri;
      playback.durationMs = 3500;
      await new Promise<void>((resolve) => {
        finishLoad = resolve;
      });
    };
    const created: unknown[] = [];
    const { result } = await renderHook(() =>
      useSoundPlayer(() => {
        created.push(playback);
        return playback;
      }),
    );

    await act(async () => {
      void result.current.play(VOICE);
      void result.current.play(VOICE);
    });

    expect(playback.loads).toBe(1);
    await act(async () => {
      finishLoad?.();
    });

    await waitFor(() => {
      expect(playback.plays).toBe(1);
    });
    expect(playback.loads).toBe(1);
    expect(created).toHaveLength(1);
    expect(result.current.status).toBe('preparing');
  });

  it('does not apply a late native status after the page is gone', async () => {
    const playback = createDeferredPlayback();
    const { result, unmount } = await renderHook(() => useSoundPlayer(() => playback));

    await act(async () => {
      await result.current.play(VOICE);
    });
    expect(result.current.status).toBe('preparing');

    await unmount();
    playback.reportPlaying(900);
    await act(async () => {
      await Promise.resolve();
    });

    expect(playback.releases).toBe(1);
    expect(playback.loadedUri).toBeNull();
  });

  it('replays a finished source without loading a second player', async () => {
    const playback = createDeferredPlayback();
    const { result } = await renderHook(() => useSoundPlayer(() => playback));

    await act(async () => {
      await result.current.play(VOICE);
    });
    playback.reportPlaying(3500);
    await waitFor(() => {
      expect(result.current.status).toBe('playing');
    });
    playback.reportFinished();
    await waitFor(() => {
      expect(result.current.status).toBe('finished');
    });
    expect(result.current.currentTimeMs).toBe(3500);
    expect(playback.loads).toBe(1);

    playback.deferPlaying = false;
    playback.currentTimeMs = 0;
    await act(async () => {
      await result.current.play(VOICE);
    });

    expect(playback.loads).toBe(1);
    expect(playback.plays).toBe(2);
    expect(result.current.status).toBe('playing');
  });

  it('surfaces a failed start with a retry that can load again', async () => {
    const playback = createMemoryAudioPlayback();
    playback.failNextPlay = true;
    const { result } = await renderHook(() => useSoundPlayer(() => playback));

    await act(async () => {
      await result.current.play(VOICE);
    });

    expect(result.current.status).toBe('unavailable');
    expect(result.current.failed).toBe(true);
    expect(result.current.currentTimeMs).toBe(0);

    await act(async () => {
      await result.current.play(VOICE);
    });

    expect(result.current.status).toBe('playing');
    expect(result.current.failed).toBe(false);
    expect(playback.loads).toBe(2);
    expect(playback.plays).toBe(1);
  });
});

describe('moment audio follows the player, not the button copy', () => {
  it('shows preparing then playing progress from the same player', async () => {
    const playback = createDeferredPlayback();
    function Harness() {
      const sound = useSoundPlayer(() => playback);
      return (
        <MomentAudio
          audio={availableAudio}
          playbackStatus={sound.failed ? 'unavailable' : sound.status}
          currentTimeMs={sound.currentTimeMs}
          onPlay={() => {
            void sound.play(VOICE);
          }}
          onPause={() => {
            void sound.pause();
          }}
          testIDPrefix="detail-sound"
          scene
        />
      );
    }

    const view = await render(<Harness />);
    fireEvent.press(view.getByLabelText('播放，4秒'));

    await waitFor(() => {
      expect(view.getByLabelText('正在准备这段声音，共4秒')).toBeTruthy();
    });
    expect(view.getByText('正在准备 · 4秒')).toBeTruthy();
    expect(view.queryByLabelText('正在播放，0秒，共4秒')).toBeNull();
    expect(view.getByLabelText('正在准备，4秒').props.accessibilityState).toEqual({ disabled: true });
    expect(view.getByTestId('detail-sound-progress-asset_voice').props.children.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: '0%' })]),
    );

    playback.reportPlaying(1000);
    await waitFor(() => {
      expect(view.getByLabelText('正在播放，1秒，共4秒')).toBeTruthy();
    });
    expect(view.getByText('正在播放 · 1秒 / 4秒')).toBeTruthy();
    expect(view.getByLabelText('暂停，4秒')).toBeTruthy();
    expect(view.getByTestId('detail-sound-progress-asset_voice').props.children.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: '29%' })]),
    );

    fireEvent.press(view.getByLabelText('暂停，4秒'));
    await waitFor(() => {
      expect(view.getByLabelText('已暂停，1秒，共4秒')).toBeTruthy();
    });
    expect(playback.loads).toBe(1);

    playback.deferPlaying = false;
    fireEvent.press(view.getByLabelText('播放，4秒'));
    await waitFor(() => {
      expect(view.getByLabelText('正在播放，1秒，共4秒')).toBeTruthy();
    });
    expect(playback.loads).toBe(1);
    expect(view.getByTestId('detail-sound-progress-asset_voice').props.children.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: '29%' })]),
    );
  });
});
