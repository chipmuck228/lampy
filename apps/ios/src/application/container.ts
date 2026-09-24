import { createUseCases } from './use-cases';
import { createSqliteRepositories, openLampyDatabase } from '../infrastructure/sqlite';

let ready: ReturnType<typeof createUseCases> | null = null;
let opening: Promise<ReturnType<typeof createUseCases>> | null = null;

export async function getUseCases() {
  if (ready) return ready;
  if (opening) return opening;
  opening = (async () => {
    const db = await openLampyDatabase();
    ready = createUseCases(createSqliteRepositories(db));
    return ready;
  })();
  return opening;
}

export function resetUseCasesForTests() {
  ready = null;
  opening = null;
}
