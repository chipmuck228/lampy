import { FREE_RECORDING_MS, PAID_RECORDING_MS, resolveRecordingLimit } from './recording-access';
import { createUseCases } from './use-cases';
import { createMemoryRepositories } from '../infrastructure/repositories';
import { createMemoryAudioCapture, createMemoryMediaStore } from '../infrastructure/media';

it('only verified ownership unlocks thirty minutes; errors and slow checks preserve free recording', async () => {
  expect(await resolveRecordingLimit(async () => true)).toBe(PAID_RECORDING_MS);
  expect(await resolveRecordingLimit(async () => false)).toBe(FREE_RECORDING_MS);
  expect(await resolveRecordingLimit(async () => { throw Error('offline'); })).toBe(FREE_RECORDING_MS);
  expect(await resolveRecordingLimit(() => new Promise(() => {}), 1)).toBe(FREE_RECORDING_MS);
});

it('snapshots the recording budget, preserves a long clip after a refund, and checks the next segment again', async () => {
  let owned = true;
  const capture = createMemoryAudioCapture({ clips: [{ sourceUri: 'memory://long.m4a', durationMs: 120_000, mimeType: 'audio/mp4' }] });
  const start = jest.spyOn(capture, 'start');
  const app = createUseCases({ ...createMemoryRepositories(), media: createMemoryMediaStore(), capture,
    recordingLimit: () => resolveRecordingLimit(async () => owned) });
  const draft = await app.restoreOrCreateDraft();
  await app.beginDraftRecording(draft.draftId);
  expect(start).toHaveBeenLastCalledWith(undefined, PAID_RECORDING_MS);
  owned = false;
  expect(app.getRecordingLimitMs()).toBe(PAID_RECORDING_MS);
  const saved = await app.finishDraftRecording(draft.draftId);
  expect(saved.audio?.durationMs).toBe(120_000);
  await app.beginDraftRecording(draft.draftId, { replace: true });
  expect(start).toHaveBeenLastCalledWith(undefined, FREE_RECORDING_MS);
  expect(app.getRecordingLimitMs()).toBe(FREE_RECORDING_MS);
});

it('does not begin recording if the page leaves during the ownership check', async () => {
  let here = true;
  const capture = createMemoryAudioCapture();
  const app = createUseCases({ ...createMemoryRepositories(), capture,
    recordingLimit: async () => { here = false; return PAID_RECORDING_MS; } });
  const draft = await app.restoreOrCreateDraft();
  await expect(app.beginDraftRecording(draft.draftId, { canStart: () => here }))
    .rejects.toMatchObject({ code: 'RECORDING_CANCELLED' });
  expect(capture.starts).toBe(0);
});
