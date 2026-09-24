import { createUseCases } from './use-cases';
import { createSqliteRepositories, openLampyDatabase } from '../infrastructure/sqlite';

export function createUseCaseLoader(load: () => Promise<ReturnType<typeof createUseCases>>) {
  let ready: ReturnType<typeof createUseCases> | null = null;
  let opening: Promise<ReturnType<typeof createUseCases>> | null = null;

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
  return createUseCases(createSqliteRepositories(db));
});

export function getUseCases() {
  return defaultLoader.getUseCases();
}

export function resetUseCasesForTests() {
  defaultLoader.reset();
}
