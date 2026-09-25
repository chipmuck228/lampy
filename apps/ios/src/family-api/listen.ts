import { mkdirSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';

import { createAppleJwksVerifier, createMapAppleVerifier } from './apple';
import { fetchAppleJwks, verifyAppleJwtSignature } from './apple-node';
import { createFamilyCommands } from './commands';
import { dispatchFamilyApi } from './http';
import { createDirectoryMediaBlobStore, createMemoryMediaBlobStore } from './media-blobs';
import { MEDIA_MAX_BYTES } from './media-validate';
import { openFamilySqliteDatabase } from './node-db';
import { planFamilyApiListen } from './runtime';
import { applyFamilyApiSchema } from './schema';
import { createSqliteFamilyRepository } from './sqlite-repository';
import { createFamilyStore } from './store';

function readRawBody(req: IncomingMessage): Promise<Buffer | 'too-large'> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      if (tooLarge) return;
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > MEDIA_MAX_BYTES + 1024) {
        tooLarge = true;
        chunks.length = 0;
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });
    req.on('end', () => resolve(tooLarge ? 'too-large' : Buffer.concat(chunks)));
    req.on('error', (error) => {
      if (tooLarge) resolve('too-large');
      else reject(error);
    });
  });
}

function headersOf(req: IncomingMessage) {
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    headers[key] = Array.isArray(value) ? value[0] : value;
  }
  return headers;
}

export async function startFamilyApiServer(options?: { port?: number; host?: string; env?: NodeJS.ProcessEnv }) {
  const env = options?.env ?? process.env;
  const plan = planFamilyApiListen(env);
  const commands =
    plan.mode === 'test'
      ? createFamilyCommands({
          store: createFamilyStore(),
          apple: createMapAppleVerifier(plan.testTokens),
          mediaBlobs: createMemoryMediaBlobStore(),
        })
      : await (async () => {
          mkdirSync(path.dirname(path.resolve(plan.databasePath)), { recursive: true });
          const db = openFamilySqliteDatabase(plan.databasePath);
          await applyFamilyApiSchema(db);
          const mediaRoot = (env.LAMPY_FAMILY_MEDIA_PATH || path.join(path.dirname(path.resolve(plan.databasePath)), 'media')).trim();
          mkdirSync(mediaRoot, { recursive: true });
          return createFamilyCommands({
            repository: createSqliteFamilyRepository(db),
            apple: createAppleJwksVerifier({
              audience: plan.appleClientId,
              fetchJwks: fetchAppleJwks,
              verifySignature: verifyAppleJwtSignature,
            }),
            mediaBlobs: createDirectoryMediaBlobStore(mediaRoot),
          });
        })();

  const port = options?.port ?? Number(env.LAMPY_FAMILY_API_PORT || 8787);
  const host = options?.host ?? env.LAMPY_FAMILY_API_HOST ?? '127.0.0.1';

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url || '/', `http://${host}:${port}`);
      const raw = await readRawBody(req);
      if (raw === 'too-large') {
        res.writeHead(413, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { code: 'MEDIA_TOO_LARGE', message: 'Media is larger than 8 MiB.' } }));
        return;
      }
      const isMediaUpload = (req.method || '').toUpperCase() === 'POST' && url.pathname.replace(/\/+$/, '') === '/v1/media';
      let body: unknown;
      if (!isMediaUpload && raw.length > 0) {
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          body = undefined;
        }
      }
      const response = await dispatchFamilyApi(commands, {
        method: req.method || 'GET',
        path: url.pathname,
        headers: headersOf(req),
        body,
        bytes: isMediaUpload ? new Uint8Array(raw) : undefined,
      });
      if (response.bytes) {
        res.writeHead(response.status, {
          'content-type': response.contentType || 'application/octet-stream',
          'content-length': String(response.bytes.byteLength),
        });
        res.end(Buffer.from(response.bytes));
        return;
      }
      res.writeHead(response.status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(response.body));
    } catch {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: { code: 'INTERNAL', message: 'Family API failed.' } }));
    }
  });

  return new Promise<{ close: () => Promise<void>; port: number; host: string; banner: string }>((resolve, reject) => {
    const onError = (error: Error) => {
      reject(error);
    };
    server.once('error', onError);
    server.listen(port, host, () => {
      server.removeListener('error', onError);
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        port: actualPort,
        host,
        banner: plan.banner,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}

if (require.main === module) {
  startFamilyApiServer()
    .then((listening) => {
      process.stdout.write(`${listening.banner}\nhttp://${listening.host}:${listening.port}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    });
}
