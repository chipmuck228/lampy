import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { createMemoryAudioPlayback } from '../infrastructure/media';
import { resetRecentClipMemoryForTests } from './recent-clip-memory';
import { useRecentClipPlayback } from './use-recent-clip-playback';

const A = { id: 'asset_a', uri: 'file://documents/a.m4a' };
const B = { id: 'asset_b', uri: 'file://documents/b.m4a' };

describe('useRecentClipPlayback isolates clips on one shared player', () => {
  beforeEach(() => {
    resetRecentClipMemoryForTests();
  });

  it('keeps A paused at its time while B plays, then resumes A there', async () => {
    const playback = createMemoryAudioPlayback();
    const { result } = await renderHook(() => useRecentClipPlayback(() => playback));

    await act(async () => {
      await result.current.play(A.id, A.uri);
    });
    playback.reportPlaying(1200);
    await waitFor(() => {
      expect(result.current.card(A.id).status).toBe('playing');
    });

    await act(async () => {
      await result.current.pause();
    });
    expect(result.current.card(A.id)).toEqual({ status: 'paused', currentTimeMs: 1200 });

    await act(async () => {
      await result.current.play(B.id, B.uri);
    });
    playback.reportPlaying(400);
    await waitFor(() => {
      expect(result.current.card(B.id)).toEqual({ status: 'playing', currentTimeMs: 400 });
    });

    expect(result.current.card(A.id)).toEqual({ status: 'paused', currentTimeMs: 1200 });
    expect(result.current.card(B.id).currentTimeMs).not.toBe(1200);
    expect(playback.loadedUri).toBe(B.uri);
    expect(playback.loads).toBe(2);

    await act(async () => {
      await result.current.play(A.id, A.uri);
    });
    expect(playback.loadedUri).toBe(A.uri);
    expect(playback.seeks).toContain(1200);
    expect(result.current.card(A.id).currentTimeMs).toBe(1200);
    expect(result.current.card(B.id)).toEqual({ status: 'paused', currentTimeMs: 400 });
  });

  it('keeps B’s pause after background teardown and does not copy it onto A', async () => {
    const handlers: ((state: AppStateStatus) => void)[] = [];
    const add = jest.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
      if (type === 'change') handlers.push(handler);
      return { remove: jest.fn() };
    });
    try {
      const playback = createMemoryAudioPlayback();
      const { result } = await renderHook(() => useRecentClipPlayback(() => playback));

      await act(async () => {
        await result.current.play(A.id, A.uri);
      });
      playback.reportPlaying(1200);
      await waitFor(() => {
        expect(result.current.card(A.id).status).toBe('playing');
      });
      await act(async () => {
        await result.current.pause();
      });

      await act(async () => {
        await result.current.play(B.id, B.uri);
      });
      playback.reportPlaying(900);
      await waitFor(() => {
        expect(result.current.card(B.id)).toEqual({ status: 'playing', currentTimeMs: 900 });
      });

      await act(async () => {
        handlers.forEach((handler) => handler('background'));
      });

      expect(result.current.card(B.id)).toEqual({ status: 'paused', currentTimeMs: 900 });
      expect(result.current.card(A.id)).toEqual({ status: 'paused', currentTimeMs: 1200 });
    } finally {
      add.mockRestore();
    }
  });

  it('restores remembered pauses after the recent page is left and opened again', async () => {
    const playback = createMemoryAudioPlayback();
    const first = await renderHook(() => useRecentClipPlayback(() => playback));

    await act(async () => {
      await first.result.current.play(A.id, A.uri);
    });
    playback.reportPlaying(1200);
    await waitFor(() => {
      expect(first.result.current.card(A.id).status).toBe('playing');
    });
    await act(async () => {
      await first.result.current.pause();
    });
    await act(async () => {
      await first.result.current.play(B.id, B.uri);
    });
    playback.reportPlaying(400);
    await waitFor(() => {
      expect(first.result.current.card(B.id).status).toBe('playing');
    });
    await act(async () => {
      await first.result.current.pause();
    });

    await first.unmount();

    const second = await renderHook(() => useRecentClipPlayback(() => createMemoryAudioPlayback()));
    expect(second.result.current.card(A.id)).toEqual({ status: 'paused', currentTimeMs: 1200 });
    expect(second.result.current.card(B.id)).toEqual({ status: 'paused', currentTimeMs: 400 });
  });

  it('surfaces a failed seek as retryable without moving B onto A’s time', async () => {
    const playback = createMemoryAudioPlayback();
    const { result } = await renderHook(() => useRecentClipPlayback(() => playback));

    await act(async () => {
      await result.current.play(A.id, A.uri);
    });
    playback.reportPlaying(1100);
    await waitFor(() => {
      expect(result.current.card(A.id).status).toBe('playing');
    });
    await act(async () => {
      await result.current.pause();
    });
    await act(async () => {
      await result.current.play(B.id, B.uri);
    });

    playback.failNextSeek = true;
    await act(async () => {
      await result.current.play(A.id, A.uri);
    });
    expect(result.current.card(A.id).status).toBe('unavailable');
    expect(result.current.card(B.id).currentTimeMs).not.toBe(1100);

    await act(async () => {
      await result.current.play(A.id, A.uri);
    });
    expect(playback.seeks).toContain(1100);
    expect(result.current.card(A.id).status).not.toBe('unavailable');
  });
});
