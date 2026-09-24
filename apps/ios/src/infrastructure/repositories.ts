import { DomainError, ERROR_CODES } from '../domain-adapters/errors';
import { validateMoment, type MomentRecord } from '../domain-adapters/moment-commands';

export type MomentRead =
  | { kind: 'ready'; moment: MomentRecord }
  | { kind: 'missing' }
  | { kind: 'unreadable' };

export interface MomentRepository {
  save(moment: MomentRecord): Promise<void>;
  findById(id: string): Promise<MomentRead>;
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
        const result = validateMoment(moment);
        if (!result.ok) {
          throw new DomainError(
            ERROR_CODES.REPOSITORY_INVALID_RECORD,
            result.errors[0]?.message || 'invalid record',
          );
        }
        const existing = moments.get(moment.id);
        if (existing && !validateMoment(existing).ok) {
          throw new DomainError(
            ERROR_CODES.REPOSITORY_INVALID_RECORD,
            'refusing to overwrite an unreadable moment',
          );
        }
        moments.set(moment.id, structuredClone(moment));
      },
      async findById(id) {
        const found = moments.get(id);
        if (!found) return { kind: 'missing' };
        return validateMoment(found).ok
          ? { kind: 'ready', moment: structuredClone(found) }
          : { kind: 'unreadable' };
      },
      async listRecent(limit = 50) {
        return [...moments.values()]
          .filter((item) => validateMoment(item).ok && item.lifecycle.status === 'active')
          .sort((a, b) => b.time.recordedAt.localeCompare(a.time.recordedAt))
          .slice(0, limit)
          .map((item) => structuredClone(item));
      },
    },
    drafts: {
      async save(draft) {
        const result = validateMoment(draft);
        if (!result.ok) {
          throw new DomainError(
            ERROR_CODES.REPOSITORY_INVALID_RECORD,
            result.errors[0]?.message || 'invalid record',
          );
        }
        if (activeDraft && activeDraft.id === draft.id && !validateMoment(activeDraft).ok) {
          throw new DomainError(
            ERROR_CODES.REPOSITORY_INVALID_RECORD,
            'refusing to overwrite an unreadable draft',
          );
        }
        activeDraft = structuredClone(draft);
      },
      async loadActive() {
        if (!activeDraft) return null;
        return validateMoment(activeDraft).ok ? structuredClone(activeDraft) : null;
      },
      async clear(draftId) {
        if (activeDraft && activeDraft.id === draftId) {
          activeDraft = null;
        }
      },
    },
  };
}
