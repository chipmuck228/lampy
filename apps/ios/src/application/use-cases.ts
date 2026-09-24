import { LOCAL_OWNER_ID } from '../domain-adapters/identity';
import {
  activateMoment,
  createDraftMoment,
  updateMomentContent,
  type MomentRecord,
} from '../domain-adapters/moment-commands';
import { projectMomentDetailView } from '../domain-adapters/moment-detail-projection';
import type { DraftRepository, MomentRepository } from '../infrastructure/repositories';
import { ApplicationError, toApplicationError } from './errors';

export type Clock = { now: () => Date };

export type RecentLifeItem = {
  id: string;
  note: string;
  recordedAt: string;
  dateLabel: string;
};

export type RecentLifeViewModel = {
  isFirstUse: boolean;
  items: RecentLifeItem[];
};

export type ComposerViewModel = {
  draftId: string;
  note: string;
  isRestored: boolean;
};

export type MomentDetailViewModel =
  | {
      kind: 'ready';
      id: string;
      note: string;
      dateLabel: string;
      precision: string;
      usedRecordedAtFallback: boolean;
      sourceLabel: string;
    }
  | { kind: 'missing'; requestedId: string };

function defaultClock(): Clock {
  return { now: () => new Date() };
}

function defaultId(): string {
  return `moment_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function calendarDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '时间未确认';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function createUseCases(deps: {
  moments: MomentRepository;
  drafts: DraftRepository;
  clock?: Clock;
  ownerId?: string;
  id?: () => string;
}) {
  const ownerId = deps.ownerId || LOCAL_OWNER_ID;
  const clock = deps.clock || defaultClock();
  const nextId = deps.id || defaultId;

  async function restoreOrCreateDraft(): Promise<ComposerViewModel> {
    const existing = await deps.drafts.loadActive();
    if (existing) {
      return {
        draftId: existing.id,
        note: existing.content.note,
        isRestored: true,
      };
    }
    const instant = clock.now();
    const draft = createDraftMoment(
      {
        ownerId,
        content: { note: '' },
        time: {
          recordedAt: instant.toISOString(),
          occurredAtPrecision: 'unknown',
        },
        origin: { type: 'created' },
      },
      { now: () => instant, ownerId, id: nextId },
    );
    await deps.drafts.save(draft);
    return { draftId: draft.id, note: '', isRestored: false };
  }

  async function updateDraftNote(draftId: string, note: string): Promise<void> {
    const draft = await deps.drafts.loadActive();
    if (!draft || draft.id !== draftId) {
      throw new ApplicationError('DRAFT_NOT_FOUND', '没有可更新的草稿');
    }
    const instant = clock.now();
    const next = updateMomentContent(draft, { content: { note } }, ownerId, instant);
    await deps.drafts.save(next);
  }

  async function saveTextMoment(draftId: string): Promise<{ id: string }> {
    const existing = await deps.moments.findById(draftId);
    if (existing && existing.lifecycle.status === 'active') {
      await deps.drafts.clear(draftId);
      return { id: existing.id };
    }

    const draft = await deps.drafts.loadActive();
    if (!draft || draft.id !== draftId) {
      throw new ApplicationError('DRAFT_NOT_FOUND', '没有可保存的草稿');
    }

    const note = draft.content.note.trim();
    if (!note) {
      throw new ApplicationError('MOMENT_EMPTY', '写一句再留下');
    }

    const instant = clock.now();
    let moment: MomentRecord = updateMomentContent(
      draft,
      {
        content: { note },
        time: {
          recordedAt: instant.toISOString(),
          occurredAtPrecision: 'unknown',
        },
      },
      ownerId,
      instant,
    );
    moment = activateMoment(moment, ownerId, instant);
    await deps.moments.save(moment);
    await deps.drafts.clear(draftId);
    return { id: moment.id };
  }

  async function getRecentLife(): Promise<RecentLifeViewModel> {
    const moments = await deps.moments.listRecent(50);
    return {
      isFirstUse: moments.length === 0,
      items: moments.map((moment) => ({
        id: moment.id,
        note: moment.content.note,
        recordedAt: moment.time.recordedAt,
        dateLabel: calendarDateLabel(moment.time.occurredAt || moment.time.recordedAt),
      })),
    };
  }

  async function getMomentDetail(momentId: string): Promise<MomentDetailViewModel> {
    if (!momentId) {
      return { kind: 'missing', requestedId: '' };
    }
    const moment = await deps.moments.findById(momentId);
    if (!moment) {
      return { kind: 'missing', requestedId: momentId };
    }
    const view = projectMomentDetailView(moment, []);
    return {
      kind: 'ready',
      id: view.id,
      note: view.content.note,
      dateLabel: view.displayDate.primary,
      precision: view.displayDate.precision,
      usedRecordedAtFallback: view.displayDate.usedRecordedAtFallback,
      sourceLabel: view.source.label,
    };
  }

  return {
    restoreOrCreateDraft,
    updateDraftNote,
    saveTextMoment,
    getRecentLife,
    getMomentDetail,
    toApplicationError,
  };
}
