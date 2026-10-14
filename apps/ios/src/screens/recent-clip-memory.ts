import type { PlaybackStatus } from '../infrastructure/media';

export type ClipListen = {
  status: PlaybackStatus;
  currentTimeMs: number;
};

export function createClipMemory() {
const session = new Map<string, ClipListen>();

function resetRecentClipMemoryForTests() {
  session.clear();
}

function rememberClip(id: string, next: ClipListen) {
  session.set(id, { status: next.status, currentTimeMs: next.currentTimeMs });
}

function rememberedClip(id: string): ClipListen | undefined {
  return session.get(id);
}

function stashOutgoing(id: string, live: ClipListen) {
  if (live.status === 'unavailable') {
    rememberClip(id, { status: 'unavailable', currentTimeMs: live.currentTimeMs });
    return;
  }
  if (live.status === 'finished') {
    rememberClip(id, { status: 'finished', currentTimeMs: live.currentTimeMs });
    return;
  }
  if (live.currentTimeMs > 0) {
    rememberClip(id, { status: 'paused', currentTimeMs: live.currentTimeMs });
    return;
  }
  rememberClip(id, { status: 'idle', currentTimeMs: 0 });
}

function resumeAtMs(id: string): number {
  const remembered = session.get(id);
  if (!remembered || remembered.status === 'finished') return 0;
  return remembered.currentTimeMs;
}

function cardListen(clipId: string, activeId: string | null, live: ClipListen): ClipListen {
  const remembered = session.get(clipId);
  if (clipId === activeId) {
    if (preferRemembered(live, remembered)) return remembered!;
    return live;
  }
  return remembered ?? { status: 'idle', currentTimeMs: 0 };
}

return {clear: resetRecentClipMemoryForTests, resetRecentClipMemoryForTests, rememberClip, rememberedClip, stashOutgoing, resumeAtMs, cardListen};
}
const shared = createClipMemory();
export const {resetRecentClipMemoryForTests, rememberClip, rememberedClip, stashOutgoing, resumeAtMs, cardListen} = shared;
function preferRemembered(live: ClipListen, remembered: ClipListen | undefined): boolean {
  if (!remembered) return false;
  if (live.status === 'unavailable' || live.status === 'playing' || live.status === 'preparing') {
    return false;
  }
  return live.status === 'idle' && (remembered.status === 'paused' || remembered.currentTimeMs > 0);
}
