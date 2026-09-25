import { createUseCases } from './use-cases';
import {
  createFamilyUseCases,
  createMemoryFamilySessionStore,
  familyMembersOrEmpty,
} from './family-use-cases';
import { createPendingFamilyOperationDisk, createPendingFamilyOperationStore } from '../infrastructure/pending-family-operations';
import { createFamilyApiClient } from '../infrastructure/family-http-client';
import { createMemoryAudioCapture, createMemoryMediaStore, createQueuedImageSource } from '../infrastructure/media';
import { createMemoryRepositories } from '../infrastructure/repositories';

function clockAt(iso: string) {
  return { now: () => new Date(iso) };
}

describe('personal library while family service is down', () => {
  it('keeps text, photo, audio, and lookback usable when family requests fail', async () => {
    const repos = createMemoryRepositories();
    const media = createMemoryMediaStore();
    const library = createQueuedImageSource({
      picks: [[{ sourceUri: 'memory://source/gate.jpg', mimeType: 'image/jpeg', width: 800, height: 600 }]],
    });
    const capture = createMemoryAudioCapture({
      clips: [{ sourceUri: 'memory://recordings/gate.m4a', durationMs: 2500, mimeType: 'audio/mp4' }],
    });
    const ids = ['asset_photo', 'asset_voice'];
    let next = 0;
    const personal = createUseCases({
      ...repos,
      media,
      library,
      capture,
      clock: clockAt('2026-09-25T12:00:00.000Z'),
      timezoneOffsetMinutes: 0,
      assetId: () => ids[next++] || `asset_extra_${next}`,
    });
    const session = createMemoryFamilySessionStore();
    await session.setSession({ userId: 'usr_stale', sessionToken: 'ses_stale' });
    const family = createFamilyUseCases({
      client: createFamilyApiClient({
        async request() {
          throw new Error('family service down');
        },
      }),
      session,
      pending: createPendingFamilyOperationStore(createPendingFamilyOperationDisk()),
    });

    const textDraft = await personal.restoreOrCreateDraft();
    await personal.updateDraftNote(textDraft.draftId, '家里断网也要留下');
    const textSaved = await personal.saveTextMoment(textDraft.draftId);

    const photoDraft = await personal.restoreOrCreateDraft();
    await personal.addLibraryImages(photoDraft.draftId);
    const photoSaved = await personal.saveTextMoment(photoDraft.draftId);

    const audioDraft = await personal.restoreOrCreateDraft();
    await personal.beginDraftRecording(audioDraft.draftId);
    await personal.finishDraftRecording(audioDraft.draftId);
    const audioSaved = await personal.saveTextMoment(audioDraft.draftId);

    expect(await family.getMembership()).toEqual({ kind: 'unconfirmed', reason: 'unreachable' });
    expect(familyMembersOrEmpty(await family.getMembership())).toEqual([]);
    await expect(family.signInWithApple('unused')).rejects.toMatchObject({ code: 'SERVER_UNREACHABLE' });

    const idsFound = (await personal.getRecentLife()).items.map((item) => item.id).sort();
    expect(idsFound).toEqual([audioSaved.id, photoSaved.id, textSaved.id].sort());

    const photoDetail = await personal.getMomentDetail(photoSaved.id);
    expect(photoDetail.kind).toBe('ready');
    if (photoDetail.kind === 'ready') {
      expect(photoDetail.images).toHaveLength(1);
      expect(photoDetail.images[0]?.status).toBe('available');
    }

    const audioDetail = await personal.getMomentDetail(audioSaved.id);
    expect(audioDetail.kind).toBe('ready');
    if (audioDetail.kind === 'ready') {
      expect(audioDetail.audio?.status).toBe('available');
    }

    const unknown = await personal.getHistoryUnknown();
    expect(unknown.items.map((item) => item.id).sort()).toEqual(
      [audioSaved.id, photoSaved.id, textSaved.id].sort(),
    );

    const upload = await family.uploadSelectedMedia({
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x00]),
      mimeType: 'image/jpeg',
    });
    expect(upload.status).toBe('failed');
    const share = await family.confirmShareMoment({ momentId: textSaved.id, sourceRevision: 1 });
    expect(share.status).toBe('failed');
    const photoAgain = await personal.getMomentDetail(photoSaved.id);
    expect(photoAgain.kind).toBe('ready');
    if (photoAgain.kind === 'ready') {
      expect(photoAgain.images[0]?.status).toBe('available');
    }
    const audioAgain = await personal.getMomentDetail(audioSaved.id);
    expect(audioAgain.kind).toBe('ready');
    if (audioAgain.kind === 'ready') {
      expect(audioAgain.audio?.status).toBe('available');
    }
  });
});
