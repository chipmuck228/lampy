import { spawn } from 'node:child_process';
import { chmodSync, closeSync, openSync } from 'node:fs';
import { chmod, mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ARGON2ID_TEST, createArgon2idPasswordHasher } from './password';
import { applyFamilyApiSchema } from './schema';
import { openFamilySqliteDatabase } from './node-db';
import { createSqliteFamilyRepository } from './sqlite-repository';
import { createFamilyCommands } from './commands';
import { createMapAppleVerifier } from './apple';
import {
  promptHiddenPassword,
  readPasswordFromRestrictedFd,
  readPasswordFromRestrictedFile,
  runTestAccountCli,
} from './test-account-cli';

const iosRoot = path.join(__dirname, '../..');
const cliScript = path.join(__dirname, '../../scripts/family-api-test-account.cjs');

async function tableNames(databasePath: string) {
  const db = openFamilySqliteDatabase(databasePath);
  try {
    const rows = await db.getAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
    return rows.map((row) => row.name);
  } finally {
    await db.close();
  }
}

async function schemaVersions(databasePath: string) {
  const db = openFamilySqliteDatabase(databasePath);
  try {
    const table = await db.getFirst<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'family_schema_migrations'",
    );
    if (!table) return [];
    const rows = await db.getAll<{ version: number }>('SELECT version FROM family_schema_migrations ORDER BY version');
    return rows.map((row) => row.version);
  } finally {
    await db.close();
  }
}

function runCliProcess(
  args: string[],
  env: Record<string, string>,
  options?: { passwordFd?: number },
) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const stdio = options?.passwordFd !== undefined ? (['ignore', 'pipe', 'pipe', options.passwordFd] as const) : (['ignore', 'pipe', 'pipe'] as const);
    const child = spawn(process.execPath, [cliScript, ...args], {
      cwd: iosRoot,
      env: { ...process.env, ...env },
      stdio: [...stdio],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('operator test-account CLI helpers', () => {
  it('reads the password from a restricted file descriptor and never takes it from argv', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lampy-cli-pw-'));
    const file = path.join(dir, 'secret');
    await writeFile(file, 'correct-horse\n', { encoding: 'utf8', mode: 0o600 });
    const handle = await open(file, 'r');
    try {
      expect(readPasswordFromRestrictedFd(handle.fd)).toBe('correct-horse');
      expect(readPasswordFromRestrictedFile(file)).toBe('correct-horse');
      await expect(
        runTestAccountCli({
          argv: ['node', 'cli', 'create', 'a@example.com', 'this-must-not-be-used'],
          env: { FAMILY_TEST_ACCOUNT_PASSWORD_FILE: file } as Record<string, string | undefined>,
        }),
      ).rejects.toThrow(/LAMPY_FAMILY_DATABASE_PATH/);
      await expect(runTestAccountCli({ argv: ['node', 'cli', 'create', 'a@example.com', 'this-must-not-be-used'] })).rejects.toThrow(
        /LAMPY_FAMILY_DATABASE_PATH/,
      );
    } finally {
      await handle.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses a group- or world-readable password file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lampy-cli-mode-'));
    const file = path.join(dir, 'secret');
    await writeFile(file, 'correct-horse\n', 'utf8');
    await chmod(file, 0o644);
    try {
      expect(() => readPasswordFromRestrictedFile(file)).toThrow(/group- or world-accessible/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses a hidden prompt when stdin is not a TTY', async () => {
    await expect(promptHiddenPassword()).rejects.toThrow(/FAMILY_TEST_ACCOUNT_PASSWORD_FD/);
  });

  it('refuses to create an account when schema 14–16 are missing and does not migrate', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lampy-cli-nomigrate-'));
    const databasePath = path.join(dir, 'family.db');
    try {
      await expect(
        runTestAccountCli({
          argv: ['node', 'cli', 'create', 'a@example.com'],
          env: { LAMPY_FAMILY_DATABASE_PATH: databasePath } as Record<string, string | undefined>,
          readPassword: async () => 'correct-horse',
        }),
      ).rejects.toThrow(/family-api:migrate/);
      const names = await tableNames(databasePath);
      expect(names).not.toContain('family_schema_migrations');
      expect(names).not.toContain('family_test_credentials');
      expect(names).not.toContain('family_accounts');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses a database stopped before migration 14 and leaves family_accounts untouched', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lampy-cli-pre14-'));
    const databasePath = path.join(dir, 'family.db');
    const db = openFamilySqliteDatabase(databasePath);
    await applyFamilyApiSchema(db, { upTo: 13 });
    await db.close();
    try {
      await expect(
        runTestAccountCli({
          argv: ['node', 'cli', 'create', 'a@example.com'],
          env: { LAMPY_FAMILY_DATABASE_PATH: databasePath } as Record<string, string | undefined>,
          readPassword: async () => 'correct-horse',
        }),
      ).rejects.toThrow(/family-api:migrate/);
      expect(await schemaVersions(databasePath)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
      ]);
      const names = await tableNames(databasePath);
      expect(names).toContain('family_accounts');
      expect(names).not.toContain('family_test_credentials');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('creates then disables a test account on an already-migrated SQLite file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lampy-cli-db-'));
    const databasePath = path.join(dir, 'family.db');
    const migrate = openFamilySqliteDatabase(databasePath);
    await applyFamilyApiSchema(migrate);
    await migrate.close();
    try {
      const created = await runTestAccountCli({
        argv: ['node', 'cli', 'create', 'a@example.com'],
        env: { LAMPY_FAMILY_DATABASE_PATH: databasePath } as Record<string, string | undefined>,
        readPassword: async () => 'correct-horse',
        passwordHasher: createArgon2idPasswordHasher(ARGON2ID_TEST),
      });
      expect(created).toMatch(/^Created test account userId=usr_/);
      const db = openFamilySqliteDatabase(databasePath);
      const commands = createFamilyCommands({
        repository: createSqliteFamilyRepository(db),
        apple: createMapAppleVerifier({}),
        testAccountLoginEnabled: true,
        passwordHasher: createArgon2idPasswordHasher(ARGON2ID_TEST),
      });
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

  it('creates then disables through npm run family-api:test-account on a migrated database', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lampy-cli-npm-'));
    const databasePath = path.join(dir, 'family.db');
    const passwordFile = path.join(dir, 'password');
    const migrate = openFamilySqliteDatabase(databasePath);
    await applyFamilyApiSchema(migrate);
    await migrate.close();
    await writeFile(passwordFile, 'correct-horse\n', { encoding: 'utf8', mode: 0o600 });

    function runNpm(args: string[], withPassword: boolean) {
      return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn('npm', ['run', 'family-api:test-account', '--', ...args], {
          cwd: iosRoot,
          env: {
            ...process.env,
            LAMPY_FAMILY_DATABASE_PATH: databasePath,
            ...(withPassword ? { FAMILY_TEST_ACCOUNT_PASSWORD_FILE: passwordFile } : {}),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (chunk) => {
          stdout += String(chunk);
        });
        child.stderr?.on('data', (chunk) => {
          stderr += String(chunk);
        });
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, stdout, stderr }));
      });
    }

    try {
      const created = await runNpm(['create', 'npm-proof@example.com'], true);
      expect(created.code).toBe(0);
      expect(created.stdout).toMatch(/Created test account userId=usr_/);
      expect(`${created.stdout}${created.stderr}`).not.toMatch(/correct-horse/);

      const disabled = await runNpm(['disable', 'npm-proof@example.com'], false);
      expect(disabled.code).toBe(0);
      expect(disabled.stdout).toMatch(/Disabled test account userId=usr_/);
      expect(`${disabled.stdout}${disabled.stderr}`).not.toMatch(/correct-horse/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('loads Argon2id through the CommonJS CLI script for create and disable', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lampy-cli-script-'));
    const databasePath = path.join(dir, 'family.db');
    const passwordFile = path.join(dir, 'password');
    const migrate = openFamilySqliteDatabase(databasePath);
    await applyFamilyApiSchema(migrate);
    await migrate.close();
    await writeFile(passwordFile, 'correct-horse\n', { encoding: 'utf8', mode: 0o600 });

    function runScript(args: string[], withPassword: boolean) {
      const passwordFd = withPassword ? openSync(passwordFile, 'r') : undefined;
      return runCliProcess(
        args,
        {
          LAMPY_FAMILY_DATABASE_PATH: databasePath,
          ...(withPassword ? { FAMILY_TEST_ACCOUNT_PASSWORD_FD: '3' } : {}),
        },
        passwordFd !== undefined ? { passwordFd } : undefined,
      ).finally(() => {
        if (passwordFd !== undefined) closeSync(passwordFd);
      });
    }

    try {
      const created = await runScript(['create', 'script@example.com'], true);
      expect(created.code).toBe(0);
      expect(created.stdout).toMatch(/^Created test account userId=usr_/);
      expect(`${created.stdout}${created.stderr}`).not.toMatch(/correct-horse/);

      const disabled = await runScript(['disable', 'script@example.com'], false);
      expect(disabled.code).toBe(0);
      expect(disabled.stdout).toMatch(/^Disabled test account userId=usr_/);
      expect(`${disabled.stdout}${disabled.stderr}`).not.toMatch(/correct-horse/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('refuses the CommonJS CLI on an unmigrated file and on a world-readable password file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lampy-cli-refuse-'));
    const unmigrated = path.join(dir, 'empty.db');
    const migrated = path.join(dir, 'family.db');
    const openFile = path.join(dir, 'open-password');
    const migrate = openFamilySqliteDatabase(migrated);
    await applyFamilyApiSchema(migrate);
    await migrate.close();
    await writeFile(openFile, 'correct-horse\n', 'utf8');
    chmodSync(openFile, 0o644);

    try {
      const missingSchema = await runCliProcess(['create', 'refuse@example.com'], {
        LAMPY_FAMILY_DATABASE_PATH: unmigrated,
        FAMILY_TEST_ACCOUNT_PASSWORD_FILE: openFile,
      });
      expect(missingSchema.code).toBe(1);
      expect(`${missingSchema.stdout}${missingSchema.stderr}`).toMatch(/family-api:migrate/);
      expect(await tableNames(unmigrated)).not.toContain('family_schema_migrations');
      expect(await tableNames(unmigrated)).not.toContain('family_test_credentials');

      const worldReadable = await runCliProcess(['create', 'refuse@example.com'], {
        LAMPY_FAMILY_DATABASE_PATH: migrated,
        FAMILY_TEST_ACCOUNT_PASSWORD_FILE: openFile,
      });
      expect(worldReadable.code).toBe(1);
      expect(`${worldReadable.stdout}${worldReadable.stderr}`).toMatch(/group- or world-accessible/);
      const db = openFamilySqliteDatabase(migrated);
      const row = await db.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM family_test_credentials');
      await db.close();
      expect(row?.n ?? 0).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
