import { validateAsset, type AssetRecord } from '../domain-adapters/asset-commands';
import { DomainError, ERROR_CODES } from '../domain-adapters/errors';
import { validateMoment, type MomentRecord } from '../domain-adapters/moment-commands';

export type MomentRead =
  | { kind: 'ready'; moment: MomentRecord }
  | { kind: 'missing' }
  | { kind: 'unreadable' };

export type MomentPage = {
  items: MomentRecord[];
  hasMore: boolean;
};

export interface MomentRepository {
  save(moment: MomentRecord): Promise<void>;
  findById(id: string): Promise<MomentRead>;
  listRecent(limit?: number): Promise<MomentRecord[]>;
  listActiveOccurredBetween(startIso: string, endIso: string): Promise<MomentRecord[]>;
  listActiveOccurredAtValues(): Promise<string[]>;
  listActiveUnknown(limit: number, offset: number): Promise<MomentPage>;
  countActiveUnknown(): Promise<number>;
}

export interface DraftRepository {
  save(draft: MomentRecord): Promise<void>;
  loadActive(): Promise<MomentRecord | null>;
  clear(draftId: string): Promise<void>;
}

export type AssetRead =
  | { kind: 'ready'; asset: AssetRecord }
  | { kind: 'missing' }
  | { kind: 'unreadable' };

export interface AssetRepository {
  save(asset: AssetRecord): Promise<void>;
  findById(id: string): Promise<AssetRead>;
}

export function createMemoryRepositories(): {
  moments: MomentRepository;
  drafts: DraftRepository;
  assets: AssetRepository;
} {
  const moments = new Map<string, MomentRecord>();
  const storedAssets = new Map<string, AssetRecord>();
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
      async listActiveOccurredAtValues() {
        return [...moments.values()]
          .filter(
            (item) =>
              validateMoment(item).ok &&
              item.lifecycle.status === 'active' &&
              !!item.time.occurredAt &&
              item.time.occurredAtPrecision !== 'unknown',
          )
          .map((item) => item.time.occurredAt as string);
      },
      async listActiveOccurredBetween(startIso, endIso) {
        return [...moments.values()]
          .filter(
            (item) =>
              validateMoment(item).ok &&
              item.lifecycle.status === 'active' &&
              !!item.time.occurredAt &&
              item.time.occurredAt >= startIso &&
              item.time.occurredAt < endIso,
          )
          .sort((a, b) => (a.time.occurredAt || '').localeCompare(b.time.occurredAt || ''))
          .map((item) => structuredClone(item));
      },
      async listActiveUnknown(limit, offset) {
        const all = [...moments.values()]
          .filter(
            (item) =>
              validateMoment(item).ok &&
              item.lifecycle.status === 'active' &&
              (item.time.occurredAtPrecision === 'unknown' || !item.time.occurredAt),
          )
          .sort((a, b) => b.time.recordedAt.localeCompare(a.time.recordedAt));
        return {
          items: all.slice(offset, offset + limit).map((item) => structuredClone(item)),
          hasMore: offset + limit < all.length,
        };
      },
      async countActiveUnknown() {
        return [...moments.values()].filter(
          (item) =>
            validateMoment(item).ok &&
            item.lifecycle.status === 'active' &&
            (item.time.occurredAtPrecision === 'unknown' || !item.time.occurredAt),
        ).length;
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
    assets: {
      async save(asset) {
        const result = validateAsset(asset);
        if (!result.ok) {
          throw new DomainError(
            ERROR_CODES.REPOSITORY_INVALID_RECORD,
            result.errors[0]?.message || 'invalid asset',
          );
        }
        const existing = storedAssets.get(asset.id);
        if (existing && !validateAsset(existing).ok) {
          throw new DomainError(
            ERROR_CODES.REPOSITORY_INVALID_RECORD,
            'refusing to overwrite an unreadable asset',
          );
        }
        storedAssets.set(asset.id, structuredClone(asset));
      },
      async findById(id) {
        const found = storedAssets.get(id);
        if (!found) return { kind: 'missing' };
        return validateAsset(found).ok
          ? { kind: 'ready', asset: structuredClone(found) }
          : { kind: 'unreadable' };
      },
    },
  };
}
