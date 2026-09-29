import { readFileSync } from 'node:fs';
import { stdin, stdout } from 'node:process';

import { createFamilyCommands } from './commands';
import { createFamilyClock, createFamilyIds } from './ids';
import { openFamilySqliteDatabase } from './node-db';
import { createArgon2idPasswordHasher, type PasswordHasher } from './password';
import { applyFamilyApiSchema } from './schema';
import { createSqliteFamilyRepository } from './sqlite-repository';

export function readPasswordFromRestrictedFd(fd: number) {
  if (!Number.isInteger(fd) || fd < 0) {
    throw new Error('FAMILY_TEST_ACCOUNT_PASSWORD_FD must be a non-negative integer file descriptor.');
  }
  return readFileSync(fd, { encoding: 'utf8' }).replace(/\r?\n$/, '');
}

export function promptHiddenPassword(
  input: NodeJS.ReadStream = stdin,
  output: NodeJS.WriteStream = stdout,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!input.isTTY || !output.isTTY) {
      reject(
        new Error(
          'Password must come from FAMILY_TEST_ACCOUNT_PASSWORD_FD or an interactive TTY. Do not pass it as a command-line argument.',
        ),
      );
      return;
    }
    output.write('Password (hidden): ');
    const chars: string[] = [];
    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\n' || ch === '\r') {
          cleanup();
          output.write('\n');
          resolve(chars.join(''));
          return;
        }
        if (ch === '\u0003') {
          cleanup();
          reject(new Error('Cancelled.'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') {
          chars.pop();
          continue;
        }
        chars.push(ch);
      }
    };
    const cleanup = () => {
      input.off('data', onData);
      input.setRawMode(false);
      input.pause();
    };
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

export async function readOperatorPassword(env: Record<string, string | undefined> = process.env) {
  const rawFd = (env.FAMILY_TEST_ACCOUNT_PASSWORD_FD || '').trim();
  if (rawFd) {
    return readPasswordFromRestrictedFd(Number(rawFd));
  }
  return promptHiddenPassword();
}

export async function runTestAccountCli(input: {
  argv: string[];
  env?: Record<string, string | undefined>;
  readPassword?: () => Promise<string>;
  passwordHasher?: PasswordHasher;
}) {
  const env = input.env ?? process.env;
  const [, , action, login] = input.argv;
  if ((action !== 'create' && action !== 'disable') || !login) {
    throw new Error(
      'Usage: family-api-test-account create <login> | disable <login>\nPassword comes from FAMILY_TEST_ACCOUNT_PASSWORD_FD or a hidden TTY prompt.',
    );
  }
  const databasePath = (env.LAMPY_FAMILY_DATABASE_PATH || '').trim();
  if (!databasePath) {
    throw new Error('LAMPY_FAMILY_DATABASE_PATH is required. This CLI talks to the SQLite file directly and does not open a public HTTP port.');
  }
  const db = openFamilySqliteDatabase(databasePath);
  await applyFamilyApiSchema(db);
  const commands = createFamilyCommands({
    repository: createSqliteFamilyRepository(db),
    apple: {
      async verifyIdentityToken() {
        throw new Error('Apple sign-in is not used by the operator CLI.');
      },
    },
    clock: createFamilyClock(),
    ids: createFamilyIds(),
    passwordHasher: input.passwordHasher ?? createArgon2idPasswordHasher(),
    testAccountLoginEnabled: false,
  });
  try {
    if (action === 'create') {
      const password = await (input.readPassword ?? (() => readOperatorPassword(env)))();
      const created = await commands.createTestAccount(login, password);
      return `Created test account userId=${created.userId}`;
    }
    const disabled = await commands.disableTestAccount(login);
    return `Disabled test account userId=${disabled.userId}`;
  } finally {
    await db.close();
  }
}
