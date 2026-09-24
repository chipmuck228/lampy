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

export type OccurredPrecision = 'exact' | 'day' | 'month' | 'year';

export const PLACED_PRECISIONS: readonly OccurredPrecision[] = ['exact', 'day', 'month', 'year'];
export const DAY_PRECISIONS: readonly OccurredPrecision[] = ['exact', 'day'];

export type HistoryCountQuery = {
  startIso: string;
  endIso: string;
  precisions: readonly OccurredPrecision[];
};

export type HistoryPageQuery = HistoryCountQuery & {
  limit: number;
  offset: number;
  order: 'occurred-asc' | 'recorded-desc';
};

export type OccurredAtSpan = {
  minIso: string;
  maxIso: string;
};

export type AssetReferenceLookup = 'referenced' | 'clear' | 'unknown';

export interface MomentRepository {
  save(moment: MomentRecord): Promise<void>;
  findById(id: string): Promise<MomentRead>;
  listRecent(limit?: number): Promise<MomentRecord[]>;
  lookupAssetReferences(assetId: string): Promise<AssetReferenceLookup>;
  countActiveUnknown(): Promise<number>;
  listActiveUnknown(limit: number, offset: number): Promise<MomentPage>;
  countActiveOccurred(query: HistoryCountQuery): Promise<number>;
  listActiveOccurred(query: HistoryPageQuery): Promise<MomentPage>;
  occurredAtSpan(precisions: readonly OccurredPrecision[]): Promise<OccurredAtSpan | null>;
}

export interface DraftRepository {
  save(draft: MomentRecord): Promise<void>;
  loadActive(): Promise<MomentRecord | null>;
  clear(draftId: string): Promise<void>;
  lookupAssetReferences(assetId: string): Promise<AssetReferenceLookup>;
}

export type AssetRead =
  | { kind: 'ready'; asset: AssetRecord }
  | { kind: 'missing' }
  | { kind: 'unreadable'; type?: string };

export interface AssetRepository {
  save(asset: AssetRecord): Promise<void>;
  findById(id: string): Promise<AssetRead>;
}

function lookupInRecords(
  records: (MomentRecord | null)[],
  assetId: string,
): AssetReferenceLookup {
  let unknown = false;
  for (const record of records) {
    if (!record) continue;
    if (!validateMoment(record).ok) {
      unknown = true;
      continue;
    }
    if (record.assetIds.includes(assetId)) return 'referenced';
  }
  return unknown ? 'unknown' : 'clear';
}

function isPlacedActive(item: MomentRecord, query: HistoryCountQuery): boolean {
  return (
    validateMoment(item).ok &&
    item.lifecycle.status === 'active' &&
    !!item.time.occurredAt &&
    item.time.occurredAt >= query.startIso &&
    item.time.occurredAt < query.endIso &&
    query.precisions.includes(item.time.occurredAtPrecision as OccurredPrecision)
  );
}

function compareOccurred(left: MomentRecord, right: MomentRecord): number {
  const byOccurred = (left.time.occurredAt || '').localeCompare(right.time.occurredAt || '');
  return byOccurred !== 0 ? byOccurred : left.time.recordedAt.localeCompare(right.time.recordedAt);
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
      async lookupAssetReferences(assetId) {
        return lookupInRecords([...moments.values()], assetId);
      },
      async countActiveUnknown() {
        return [...moments.values()].filter(
          (item) =>
            validateMoment(item).ok &&
            item.lifecycle.status === 'active' &&
            (item.time.occurredAtPrecision === 'unknown' || !item.time.occurredAt),
        ).length;
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
      async countActiveOccurred(query) {
        return [...moments.values()].filter((item) => isPlacedActive(item, query)).length;
      },
      async listActiveOccurred(query) {
        const all = [...moments.values()]
          .filter((item) => isPlacedActive(item, query))
          .sort((left, right) =>
            query.order === 'recorded-desc'
              ? right.time.recordedAt.localeCompare(left.time.recordedAt)
              : compareOccurred(left, right),
          );
        return {
          items: all.slice(query.offset, query.offset + query.limit).map((item) => structuredClone(item)),
          hasMore: query.offset + query.limit < all.length,
        };
      },
      async occurredAtSpan(precisions) {
        const isos = [...moments.values()]
          .filter(
            (item) =>
              validateMoment(item).ok &&
              item.lifecycle.status === 'active' &&
              !!item.time.occurredAt &&
              precisions.includes(item.time.occurredAtPrecision as OccurredPrecision),
          )
          .map((item) => item.time.occurredAt as string);
        if (isos.length === 0) return null;
        return {
          minIso: isos.reduce((left, right) => (left < right ? left : right)),
          maxIso: isos.reduce((left, right) => (left > right ? left : right)),
        };
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
      async lookupAssetReferences(assetId) {
        return lookupInRecords([activeDraft], assetId);
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
          : { kind: 'unreadable', type: typeof found.type === 'string' ? found.type : undefined };
      },
    },
  };
}
