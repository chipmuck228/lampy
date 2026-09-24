/* eslint-disable @typescript-eslint/no-require-imports */
const commands = require('@lampy/domain/moment/moment.commands.js') as {
  createDraftMoment: (input: object, dependencies?: object) => MomentRecord;
  activateMoment: (moment: MomentRecord, actorId: string, now?: Date | string) => MomentRecord;
  updateMomentContent: (
    moment: MomentRecord,
    patch: object,
    actorId: string,
    now?: Date | string,
  ) => MomentRecord;
  attachAsset: (
    moment: MomentRecord,
    assetId: string,
    actorId: string,
    now?: Date | string,
  ) => MomentRecord;
  detachAsset: (
    moment: MomentRecord,
    assetId: string,
    actorId: string,
    now?: Date | string,
  ) => MomentRecord;
  validateMoment: (raw: unknown) => { ok: boolean; errors: { code: string; message: string }[] };
};

export type MomentRecord = {
  id: string;
  schemaVersion: number;
  revision: number;
  ownerId: string;
  content: { note: string; significance: string; emotion: string };
  time: {
    occurredAt?: string;
    occurredAtPrecision: string;
    recordedAt: string;
    importedAt?: string;
    timezone?: string;
  };
  assetIds: string[];
  origin: { type: string };
  accessSummary: { visibility: string; futureAccessEnabled: boolean };
  lifecycle: { status: string; activatedAt?: string };
  audit: { createdAt: string; updatedAt: string };
};

export const {
  createDraftMoment,
  activateMoment,
  updateMomentContent,
  attachAsset,
  detachAsset,
  validateMoment,
} = commands;
