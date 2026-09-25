import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createIosFamilyUseCases } from './container';
import { createMemoryFamilySessionStore } from './family-use-cases';
import { createUseCases } from './use-cases';
import { createFamilyApiClient } from '../infrastructure/family-http-client';
import { openPreparedNodeSqliteDatabase } from '../infrastructure/node-sqlite';
import { createSqliteRepositories } from '../infrastructure/sqlite-repositories';

async function withSqliteFile<T>(run: (file: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'lampy-family-personal-'));
  const file = path.join(dir, 'lampy.db');
  try {
    return await run(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('iOS family composition root personal library', () => {
  it('cannot preview a personal moment unless the same SQLite library is injected', async () => {
    await withSqliteFile(async (file) => {
      const db = await openPreparedNodeSqliteDatabase(file);
      const repos = createSqliteRepositories(db);
      const personal = createUseCases({
        ...repos,
        clock: { now: () => new Date('2026-09-25T02:00:00.000Z') },
      });
      const draft = await personal.restoreOrCreateDraft();
      await personal.updateDraftNote(draft.draftId, '门口的风');
      const saved = await personal.saveTextMoment(draft.draftId);
      const client = createFamilyApiClient({
        async request(input) {
          if (input.path === '/v1/me/membership') {
            return { status: 200, body: { family: { familyId: 'fam_1', role: 'creator', members: [] } } };
          }
          throw new Error(`unexpected ${input.path}`);
        },
      });
      const session = createMemoryFamilySessionStore();
      await session.setSession({ userId: 'usr_alice', sessionToken: 'ses_alice' });

      const missing = createIosFamilyUseCases({ db, client, session });
      await expect(missing.prepareSharePreview(saved.id)).rejects.toMatchObject({ code: 'MOMENT_NOT_FOUND' });

      const wired = createIosFamilyUseCases({
        db,
        client,
        session,
        personal: { moments: repos.moments, assets: repos.assets },
      });
      const preview = await wired.prepareSharePreview(saved.id);
      expect(preview.note).toBe('门口的风');
      expect(preview.sourceMomentId).toBe(saved.id);
      expect(preview.familyId).toBe('fam_1');
      await db.close();
    });
  });
});
