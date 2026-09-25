import { mkdirSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';

import { createAppleJwksVerifier, createMapAppleVerifier } from './apple';
import { fetchAppleJwks, verifyAppleJwtSignature } from './apple-node';
import { createFamilyCommands } from './commands';
import { dispatchFamilyApi } from './http';
import { openFamilySqliteDatabase } from './node-db';
import { planFamilyApiListen } from './runtime';
import { applyFamilyApiSchema } from './schema';
import { createSqliteFamilyRepository } from './sqlite-repository';
import { createFamilyStore } from './store';

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve(undefined);
      }
    });
    req.on('error', reject);
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
        })
      : await (async () => {
          mkdirSync(path.dirname(path.resolve(plan.databasePath)), { recursive: true });
          const db = openFamilySqliteDatabase(plan.databasePath);
          await applyFamilyApiSchema(db);
          return createFamilyCommands({
            repository: createSqliteFamilyRepository(db),
            apple: createAppleJwksVerifier({
              audience: plan.appleClientId,
              fetchJwks: fetchAppleJwks,
              verifySignature: verifyAppleJwtSignature,
            }),
          });
        })();

  const port = options?.port ?? Number(env.LAMPY_FAMILY_API_PORT || 8787);
  const host = options?.host ?? env.LAMPY_FAMILY_API_HOST ?? '127.0.0.1';

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url || '/', `http://${host}:${port}`);
      const response = await dispatchFamilyApi(commands, {
        method: req.method || 'GET',
        path: url.pathname,
        headers: headersOf(req),
        body: await readBody(req),
      });
      res.writeHead(response.status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(response.body));
    } catch {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: { code: 'INTERNAL', message: 'Family API failed.' } }));
    }
  });

  return new Promise<{ close: () => Promise<void>; port: number; host: string; banner: string }>((resolve) => {
    server.listen(port, host, () => {
      resolve({
        port,
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
