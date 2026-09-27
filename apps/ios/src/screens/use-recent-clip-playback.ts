import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { createExpoAudioPlayback } from '../infrastructure/expo-audio';
import type { AudioPlayback } from '../infrastructure/media';
import { useSoundPlayer } from './use-sound-player';
import {
  cardListen,
  rememberClip,
  resumeAtMs,
  stashOutgoing,
  type ClipListen,
} from './recent-clip-memory';

export function useRecentClipPlayback(createPlayback: () => AudioPlayback = createExpoAudioPlayback) {
  const sound = useSoundPlayer(createPlayback);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const heardRef = useRef<{ id: string | null } & ClipListen>({
    id: null,
    status: 'idle',
    currentTimeMs: 0,
  });

  const live: ClipListen = {
    status: sound.failed ? 'unavailable' : sound.status,
    currentTimeMs: sound.currentTimeMs,
  };

  useEffect(() => {
    const next: ClipListen = {
      status: sound.failed ? 'unavailable' : sound.status,
      currentTimeMs: sound.currentTimeMs,
    };
    if (next.status === 'idle' && next.currentTimeMs === 0) return;
    heardRef.current = { id: activeId, ...next };
    if (!activeId) return;
    if (next.status === 'unavailable') {
      rememberClip(activeId, {
        status: 'unavailable',
        currentTimeMs: Math.max(next.currentTimeMs, resumeAtMs(activeId)),
      });
      return;
    }
    rememberClip(activeId, next);
  }, [activeId, sound.failed, sound.status, sound.currentTimeMs]);

  useEffect(() => {
    function stashHeard() {
      const heard = heardRef.current;
      if (heard.id) stashOutgoing(heard.id, { status: heard.status, currentTimeMs: heard.currentTimeMs });
    }
    const app = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stashHeard();
    });
    return () => {
      stashHeard();
      app?.remove?.();
    };
  }, []);

  return {
    card(clipId: string): ClipListen {
      return cardListen(clipId, activeId, live);
    },
    async play(id: string, uri: string) {
      const outgoing = activeIdRef.current;
      if (outgoing && outgoing !== id) {
        const heard = heardRef.current.id === outgoing ? heardRef.current : live;
        stashOutgoing(outgoing, { status: heard.status, currentTimeMs: heard.currentTimeMs });
        try {
          await sound.pause();
        } catch {
          // Shared player will load the next uri.
        }
      }
      activeIdRef.current = id;
      setActiveId(id);
      await sound.play(uri, resumeAtMs(id));
    },
    async pause() {
      await sound.pause();
      const id = activeIdRef.current;
      if (id) stashOutgoing(id, { status: 'paused', currentTimeMs: sound.currentTimeMs });
    },
  };
}
