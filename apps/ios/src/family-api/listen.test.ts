import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, get as httpGet, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { startFamilyApiServer } from './listen';
import { sampleJpegBytes } from './media-validate';

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
        expect(JSON.parse(health.body)).toMatchObject({ ok: true, slice: 'identity-membership', media: true });
        expect(existsSync(path.join(dir, 'volume', 'media'))).toBe(true);
      } finally {
        await listening.close();
      }
    });
  });

  it('accepts authenticated raw media bytes and returns them without leaking host paths', async () => {
    const listening = await startFamilyApiServer({
      port: 0,
      host: '127.0.0.1',
      env: {
        LAMPY_FAMILY_API_MODE: 'test',
        LAMPY_FAMILY_API_TEST_TOKENS: 'review-token:apple.review.sub',
      },
    });
    try {
      const signedIn = await new Promise<{ status?: number; body: { sessionToken?: string } }>((resolve, reject) => {
        const req = httpRequest(
          {
            hostname: '127.0.0.1',
            port: listening.port,
            method: 'POST',
            path: '/v1/auth/apple',
            headers: { 'content-type': 'application/json' },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            res.on('end', () =>
              resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }),
            );
          },
        );
        req.on('error', reject);
        req.end(JSON.stringify({ identityToken: 'review-token' }));
      });
      const token = signedIn.body.sessionToken || '';
      const jpeg = sampleJpegBytes();
      const uploaded = await new Promise<{ status?: number; body: { objectId?: string } }>((resolve, reject) => {
        const req = httpRequest(
          {
            hostname: '127.0.0.1',
            port: listening.port,
            method: 'POST',
            path: '/v1/media',
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'image/jpeg',
              'content-length': String(jpeg.length),
            },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            res.on('end', () => {
              const text = Buffer.concat(chunks).toString('utf8');
              resolve({ status: res.statusCode, body: JSON.parse(text) });
            });
          },
        );
        req.on('error', reject);
        req.end(Buffer.from(jpeg));
      });
      expect(uploaded.status).toBe(200);
      expect(JSON.stringify(uploaded.body)).not.toMatch(/localUri|\/Users\/|review-token/);
      const objectId = uploaded.body.objectId || '';
      const content = await new Promise<{ status?: number; type?: string; bytes: Buffer }>((resolve, reject) => {
        httpGet(
          {
            hostname: '127.0.0.1',
            port: listening.port,
            path: `/v1/media/${objectId}/content`,
            headers: { authorization: `Bearer ${token}` },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            res.on('end', () =>
              resolve({ status: res.statusCode, type: res.headers['content-type'], bytes: Buffer.concat(chunks) }),
            );
          },
        ).on('error', reject);
      });
      expect(content.status).toBe(200);
      expect(content.type).toBe('image/jpeg');
      expect(Array.from(content.bytes)).toEqual(Array.from(jpeg));
    } finally {
      await listening.close();
    }
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
