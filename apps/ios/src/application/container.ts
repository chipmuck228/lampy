import { createUseCases } from './use-cases';
import {
  createFamilyUseCases,
  type FamilySessionStore,
  type FamilyUseCases,
} from './family-use-cases';
import { createExpoAudioCapture } from '../infrastructure/expo-audio';
import { familyApiBaseUrl } from '../infrastructure/family-config';
import { createFamilyApiClient, createFamilyHttpTransport, type FamilyApiClient } from '../infrastructure/family-http-client';
import { createSqlitePendingFamilyOperationStore } from '../infrastructure/pending-family-operations';
import { createSecureFamilySessionStore } from '../infrastructure/secure-family-session';
import {
  createExpoCameraSource,
  createExpoLibrarySource,
  createExpoMediaStore,
  readExpoAssetBytes,
} from '../infrastructure/expo-media';
import { createSqliteRepositories, openLampyDatabase } from '../infrastructure/sqlite';
import type { SqlDatabase } from '../infrastructure/sql';
import type { AssetRead, MomentRead } from '../infrastructure/repositories';

export function createUseCaseLoader<T>(load: () => Promise<T>) {
  let ready: T | null = null;
  let opening: Promise<T> | null = null;

  async function getUseCases() {
    if (ready) return ready;
    if (opening) return opening;
    opening = (async () => {
      try {
        ready = await load();
        return ready;
      } catch (error) {
        opening = null;
        throw error;
      }
    })();
    return opening;
  }

  function reset() {
    ready = null;
    opening = null;
  }

  return { getUseCases, reset };
}

const defaultLoader = createUseCaseLoader(async () => {
  const db = await openLampyDatabase();
  return createUseCases({
    ...createSqliteRepositories(db),
    media: createExpoMediaStore(),
    library: createExpoLibrarySource(),
    camera: createExpoCameraSource(),
    capture: createExpoAudioCapture(),
  });
});

export function getUseCases() {
  return defaultLoader.getUseCases();
}

export function resetUseCasesForTests() {
  defaultLoader.reset();
}

export type FamilyPersonalLibrary = {
  moments: { findById(id: string): Promise<MomentRead> };
  assets: { findById(id: string): Promise<AssetRead> };
  readAssetBytes?: (localUri: string) => Promise<Uint8Array>;
};

export function createIosFamilyUseCases(deps: {
  db: SqlDatabase;
  client: FamilyApiClient;
  session: FamilySessionStore;
  idempotencyKey?: (prefix: string) => string;
  personal?: FamilyPersonalLibrary;
}): FamilyUseCases {
  return createFamilyUseCases({
    client: deps.client,
    session: deps.session,
    pending: createSqlitePendingFamilyOperationStore(deps.db),
    idempotencyKey: deps.idempotencyKey,
    personal: deps.personal,
  });
}

const familyLoader = createUseCaseLoader(async () => {
  const db = await openLampyDatabase();
  const repos = createSqliteRepositories(db);
  return createIosFamilyUseCases({
    db,
    client: createFamilyApiClient(createFamilyHttpTransport({ baseUrl: familyApiBaseUrl() })),
    session: createSecureFamilySessionStore(),
    personal: {
      moments: repos.moments,
      assets: repos.assets,
      readAssetBytes: readExpoAssetBytes,
    },
  });
});

export function getFamilyUseCases() {
  return familyLoader.getUseCases();
}

export function resetFamilyUseCasesForTests() {
  familyLoader.reset();
}
