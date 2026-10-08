import type { FamilyListView, FamilySummary } from '../family-api/types';

export type FamilyDirectoryState = {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  families: FamilySummary[];
  selectedId: string | null;
  error: unknown;
};

// In-memory selection only. A selected id is never an authorization grant.
export function createFamilyDirectory() {
  let generation = 0;
  let preferredId: string | null = null;
  let state: FamilyDirectoryState = { status: 'idle', families: [], selectedId: null, error: null };
  return {
    snapshot: () => state,
    invalidate() {
      generation++;
      state = { status: 'idle', families: [], selectedId: null, error: null };
    },
    select(id: string) {
      if (state.status !== 'ready' || !state.families.some(f => f.familyId === id)) return false;
      preferredId = id;
      state = { ...state, selectedId: id };
      return true;
    },
    async load(read: () => Promise<FamilyListView>) {
      const request = ++generation;
      state = { status: 'loading', families: [], selectedId: null, error: null };
      try {
        const result = await read();
        if (request !== generation) return;
        const selectedId = result.families.some(f => f.familyId === preferredId) ? preferredId : null;
        state = { status: 'ready', families: result.families, selectedId, error: null };
      } catch (error) {
        if (request === generation) state = { status: 'failed', families: [], selectedId: null, error };
      }
    },
  };
}
