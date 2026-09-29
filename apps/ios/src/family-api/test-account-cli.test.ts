import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ARGON2ID_TEST, createArgon2idPasswordHasher } from './password';
import { applyFamilyApiSchema } from './schema';
import { openFamilySqliteDatabase } from './node-db';
import { createSqliteFamilyRepository } from './sqlite-repository';
import { createFamilyCommands } from './commands';
import { createMapAppleVerifier } from './apple';
import { promptHiddenPassword, readPasswordFromRestrictedFd, runTestAccountCli } from './test-account-cli';

describe('operator test-account CLI helpers', () => {
  it('reads the password from a restricted file descriptor and never takes it from argv', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lampy-cli-pw-'));
    const file = path.join(dir, 'secret');
    await writeFile(file, 'correct-horse\n', 'utf8');
    const handle = await open(file, 'r');
    try {
      expect(readPasswordFromRestrictedFd(handle.fd)).toBe('correct-horse');
      await expect(runTestAccountCli({ argv: ['node', 'cli', 'create', 'a@example.com', 'this-must-not-be-used'] })).rejects.toThrow(
        /LAMPY_FAMILY_DATABASE_PATH/,
      );
    } finally {
      await handle.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses a hidden prompt when stdin is not a TTY', async () => {
    await expect(promptHiddenPassword()).rejects.toThrow(/FAMILY_TEST_ACCOUNT_PASSWORD_FD/);
  });

  it('creates then disables a test account on an isolated SQLite file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lampy-cli-db-'));
    const databasePath = path.join(dir, 'family.db');
    try {
      const created = await runTestAccountCli({
        argv: ['node', 'cli', 'create', 'a@example.com'],
        env: { LAMPY_FAMILY_DATABASE_PATH: databasePath } as Record<string, string | undefined>,
        readPassword: async () => 'correct-horse',
        passwordHasher: createArgon2idPasswordHasher(ARGON2ID_TEST),
      });
      expect(created).toMatch(/^Created test account userId=usr_/);
      const db = openFamilySqliteDatabase(databasePath);
      await applyFamilyApiSchema(db);
      const commands = createFamilyCommands({
        repository: createSqliteFamilyRepository(db),
        apple: createMapAppleVerifier({}),
        testAccountLoginEnabled: true,
        passwordHasher: createArgon2idPasswordHasher(ARGON2ID_TEST),
      });
      // Production hasher was used by the CLI; sign-in must still work with the stored hash.
      const signed = await commands.signInWithTestAccount({ login: 'a@example.com', password: 'correct-horse' });
      expect(signed.userId).toMatch(/^usr_/);
      await db.close();

      const disabled = await runTestAccountCli({
        argv: ['node', 'cli', 'disable', 'a@example.com'],
        env: { LAMPY_FAMILY_DATABASE_PATH: databasePath } as Record<string, string | undefined>,
      });
      expect(disabled).toMatch(/^Disabled test account userId=usr_/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
