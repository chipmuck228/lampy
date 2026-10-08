export type HomeScreenAction = 'write' | 'camera' | 'record' | 'share';
export type PendingHomeScreenAction = { kind: HomeScreenAction; requestId: string };
export const LAMPY_PUBLIC_URL = 'https://yunpura.com';

export function createHomeScreenActionQueue() {
  let pending: PendingHomeScreenAction | null = null;
  const seen = new Set<string>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(listener => listener());
  return {
    snapshot: () => pending,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    receive(input: { id?: unknown; requestId?: unknown }) {
      const kinds: Record<string, HomeScreenAction> = {
        'app.lampy.write': 'write', 'app.lampy.camera': 'camera',
        'app.lampy.record': 'record', 'app.lampy.share': 'share',
      };
      const kind = typeof input.id === 'string' && Object.hasOwn(kinds, input.id) ? kinds[input.id] : undefined;
      if (!kind || typeof input.requestId !== 'string' || !input.requestId || seen.has(input.requestId)) return;
      seen.add(input.requestId);
      if (seen.size > 64) seen.delete(seen.values().next().value!);
      pending = { kind, requestId: input.requestId };
      emit();
    },
    consume(requestId: string) {
      if (pending?.requestId !== requestId) return null;
      const result = pending;
      pending = null;
      emit();
      return result;
    },
    cancel() { pending = null; emit(); },
  };
}

export const homeScreenActions = createHomeScreenActionQueue();

// Native delivery is converted to a one-use capability. A URL parameter alone
// cannot focus, open a camera or start recording. No capability survives restart.
const entries = new Map<string, Exclude<HomeScreenAction, 'share'>>();
let sequence = 0;
export function homeScreenLeaveHref(kind: Exclude<HomeScreenAction, 'share'>) {
  const quick = `quick_${Date.now()}_${++sequence}`;
  entries.set(quick, kind);
  if (entries.size > 16) entries.delete(entries.keys().next().value!);
  return { pathname: '/leave' as const, params: { from: 'recent', quick } };
}
export function takeHomeScreenEntry(value: string | string[] | undefined) {
  const key = Array.isArray(value) ? value[0] : value;
  if (!key) return null;
  const kind = entries.get(key) ?? null;
  entries.delete(key);
  return kind;
}
export function forgetHomeScreenEntry(value: string | string[] | undefined) {
  const key = Array.isArray(value) ? value[0] : value;
  if (key) entries.delete(key);
}

export function forgetAllHomeScreenEntries() { entries.clear(); }
