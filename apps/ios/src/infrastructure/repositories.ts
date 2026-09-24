import type { MomentRecord } from '../domain-adapters/moment-commands';

export interface MomentRepository {
  save(moment: MomentRecord): Promise<void>;
  findById(id: string): Promise<MomentRecord | null>;
  listRecent(limit?: number): Promise<MomentRecord[]>;
}

export interface DraftRepository {
  save(draft: MomentRecord): Promise<void>;
  loadActive(): Promise<MomentRecord | null>;
  clear(draftId: string): Promise<void>;
}

export function createMemoryRepositories(): {
  moments: MomentRepository;
  drafts: DraftRepository;
} {
  const moments = new Map<string, MomentRecord>();
  let activeDraft: MomentRecord | null = null;

  return {
    moments: {
      async save(moment) {
        moments.set(moment.id, structuredClone(moment));
      },
      async findById(id) {
        const found = moments.get(id);
        return found ? structuredClone(found) : null;
      },
      async listRecent(limit = 50) {
        return [...moments.values()]
          .filter((item) => item.lifecycle.status === 'active')
          .sort((a, b) => b.time.recordedAt.localeCompare(a.time.recordedAt))
          .slice(0, limit)
          .map((item) => structuredClone(item));
      },
    },
    drafts: {
      async save(draft) {
        activeDraft = structuredClone(draft);
      },
      async loadActive() {
        return activeDraft ? structuredClone(activeDraft) : null;
      },
      async clear(draftId) {
        if (activeDraft && activeDraft.id === draftId) {
          activeDraft = null;
        }
      },
    },
  };
}
