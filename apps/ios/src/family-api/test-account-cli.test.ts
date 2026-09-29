import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
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

  it('creates then disables through npm run family-api:test-account on an isolated database', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lampy-cli-npm-'));
    const databasePath = path.join(dir, 'family.db');
    const passwordFile = path.join(dir, 'password');
    await writeFile(passwordFile, 'correct-horse\n', 'utf8');
    const iosRoot = path.join(__dirname, '../..');

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
    await writeFile(passwordFile, 'correct-horse\n', 'utf8');
    const script = path.join(__dirname, '../../scripts/family-api-test-account.cjs');
    const iosRoot = path.join(__dirname, '../..');

    function runScript(args: string[], withPassword: boolean) {
      return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
        const passwordFd = withPassword ? openSync(passwordFile, 'r') : undefined;
        const child = spawn(process.execPath, [script, ...args], {
          cwd: iosRoot,
          env: {
            ...process.env,
            LAMPY_FAMILY_DATABASE_PATH: databasePath,
            ...(withPassword ? { FAMILY_TEST_ACCOUNT_PASSWORD_FD: '3' } : {}),
          },
          stdio: withPassword ? ['ignore', 'pipe', 'pipe', passwordFd] : ['ignore', 'pipe', 'pipe'],
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
        child.on('close', (code) => {
          if (passwordFd !== undefined) closeSync(passwordFd);
          resolve({ code, stdout, stderr });
        });
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
});
