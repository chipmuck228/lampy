/* eslint-disable @typescript-eslint/no-require-imports */
const commands = require('../../../../domain/moment/moment.commands.js') as {
  createDraftMoment: (input: object, dependencies?: object) => MomentRecord;
  activateMoment: (moment: MomentRecord, actorId: string, now?: Date | string) => MomentRecord;
  updateMomentContent: (
    moment: MomentRecord,
    patch: object,
    actorId: string,
    now?: Date | string,
  ) => MomentRecord;
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

export const { createDraftMoment, activateMoment, updateMomentContent } = commands;
