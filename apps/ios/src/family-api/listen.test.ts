import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, get as httpGet } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { startFamilyApiServer } from './listen';

async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'lampy-family-listen-'));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function getHealth(port: number) {
  return new Promise<{ status?: number; body: string }>((resolve, reject) => {
    httpGet(`http://127.0.0.1:${port}/health`, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });
}

describe('family API listen startup', () => {
  it('opens the SQLite file on the configured path before listening in production', async () => {
    await withTempDir(async (dir) => {
      const databasePath = path.join(dir, 'volume', 'family.db');
      const listening = await startFamilyApiServer({
        port: 0,
        host: '127.0.0.1',
        env: {
          LAMPY_FAMILY_API_MODE: 'production',
          LAMPY_FAMILY_DATABASE_PATH: databasePath,
          LAMPY_APPLE_CLIENT_ID: 'app.lampy.ios',
        },
      });
      try {
        expect(existsSync(databasePath)).toBe(true);
        const health = await getHealth(listening.port);
        expect(health.status).toBe(200);
        expect(JSON.parse(health.body)).toMatchObject({ ok: true, slice: 'identity-membership' });
      } finally {
        await listening.close();
      }
    });
  });

  it('refuses to start production when test tokens are set', async () => {
    await expect(
      startFamilyApiServer({
        port: 0,
        host: '127.0.0.1',
        env: {
          LAMPY_FAMILY_API_MODE: 'production',
          LAMPY_FAMILY_DATABASE_PATH: '/tmp/should-not-open.db',
          LAMPY_APPLE_CLIENT_ID: 'app.lampy.ios',
          LAMPY_FAMILY_API_TEST_TOKENS: 'review-token:apple.review.sub',
        },
      }),
    ).rejects.toThrow(/TEST_TOKENS/);
  });

  it('fails startup when the listen port is already taken', async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const address = blocker.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    try {
      await expect(
        startFamilyApiServer({
          port,
          host: '127.0.0.1',
          env: {
            LAMPY_FAMILY_API_MODE: 'test',
            LAMPY_FAMILY_API_TEST_TOKENS: 'review-token:apple.review.sub',
          },
        }),
      ).rejects.toThrow(/EADDRINUSE/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        blocker.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
