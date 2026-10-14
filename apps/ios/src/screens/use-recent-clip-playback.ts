import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { createExpoAudioPlayback } from '../infrastructure/expo-audio';
import type { AudioPlayback } from '../infrastructure/media';
import { useSoundPlayer } from './use-sound-player';
import {
  createClipMemory,
  cardListen,
  rememberClip,
  resumeAtMs,
  stashOutgoing,
  type ClipListen,
} from './recent-clip-memory';

const sharedMemory = {cardListen, rememberClip, resumeAtMs, stashOutgoing};
export function useRecentClipPlayback(createPlayback: () => AudioPlayback = createExpoAudioPlayback, ephemeral = false) {
  const [privateMemory] = useState(createClipMemory);
  const memory = ephemeral ? privateMemory : sharedMemory;
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
      memory.rememberClip(activeId, {
        status: 'unavailable',
        currentTimeMs: Math.max(next.currentTimeMs, memory.resumeAtMs(activeId)),
      });
      return;
    }
    memory.rememberClip(activeId, next);
  }, [activeId, sound.failed, sound.status, sound.currentTimeMs, memory]);

  useEffect(() => {
    function stashHeard() {
      const heard = heardRef.current;
      if (heard.id) memory.stashOutgoing(heard.id, { status: heard.status, currentTimeMs: heard.currentTimeMs });
    }
    const app = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stashHeard();
    });
    return () => {
      stashHeard();
      app?.remove?.();
    };
  }, [memory]);

  return {
    card(clipId: string): ClipListen {
      return memory.cardListen(clipId, activeId, live);
    },
    async play(id: string, uri: string) {
      const outgoing = activeIdRef.current;
      if (outgoing && outgoing !== id) {
        const heard = heardRef.current.id === outgoing ? heardRef.current : live;
        memory.stashOutgoing(outgoing, { status: heard.status, currentTimeMs: heard.currentTimeMs });
        try {
          await sound.pause();
        } catch {
          // Shared player will load the next uri.
        }
      }
      activeIdRef.current = id;
      setActiveId(id);
      await sound.play(uri, memory.resumeAtMs(id));
    },
    async release() { await sound.release(); privateMemory.clear(); },
    async pause() {
      await sound.pause();
      const id = activeIdRef.current;
      if (id) memory.stashOutgoing(id, { status: 'paused', currentTimeMs: sound.currentTimeMs });
    },
  };
}
