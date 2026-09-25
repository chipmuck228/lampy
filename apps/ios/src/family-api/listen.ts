import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { createAppleJwksVerifier, createMapAppleVerifier } from './apple';
import { fetchAppleJwks, verifyAppleJwtSignature } from './apple-node';
import { createFamilyCommands } from './commands';
import { dispatchFamilyApi } from './http';
import { createFamilyStore } from './store';
import type { AppleVerifier } from './types';

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

function parseTestTokens(raw: string | undefined) {
  const tokens: Record<string, { appleSubject: string; email?: string }> = {};
  if (!raw) return tokens;
  for (const item of raw.split(',')) {
    const [token, subject, email] = item.split(':').map((part) => part.trim());
    if (token && subject) {
      tokens[token] = { appleSubject: subject, email: email || undefined };
    }
  }
  return tokens;
}

export function startFamilyApiServer(options?: { port?: number; host?: string }) {
  const mode = process.env.LAMPY_FAMILY_API_MODE || 'unset';
  const appleClientId = process.env.LAMPY_APPLE_CLIENT_ID || '';
  const testTokens = parseTestTokens(process.env.LAMPY_FAMILY_API_TEST_TOKENS);

  let apple: AppleVerifier;
  if (mode === 'test') {
    if (!Object.keys(testTokens).length) {
      throw new Error('LAMPY_FAMILY_API_TEST_TOKENS is required in test mode (token:appleSubject[,...]).');
    }
    apple = createMapAppleVerifier(testTokens);
  } else if (mode === 'production') {
    if (!appleClientId) {
      throw new Error('LAMPY_APPLE_CLIENT_ID is required in production mode. Do not invent a bundle id or key.');
    }
    apple = createAppleJwksVerifier({
      audience: appleClientId,
      fetchJwks: fetchAppleJwks,
      verifySignature: verifyAppleJwtSignature,
    });
  } else {
    throw new Error(
      'Set LAMPY_FAMILY_API_MODE=test with LAMPY_FAMILY_API_TEST_TOKENS for local review, or LAMPY_FAMILY_API_MODE=production with LAMPY_APPLE_CLIENT_ID after Apple credentials exist. In-memory store is not a deployed production database.',
    );
  }

  const commands = createFamilyCommands({
    store: createFamilyStore(),
    apple,
  });

  const port = options?.port ?? Number(process.env.LAMPY_FAMILY_API_PORT || 8787);
  const host = options?.host ?? process.env.LAMPY_FAMILY_API_HOST ?? '127.0.0.1';

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

  return new Promise<{ close: () => Promise<void>; port: number; host: string }>((resolve) => {
    server.listen(port, host, () => {
      resolve({
        port,
        host,
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
      process.stdout.write(
        `Lampy family API (test mode, in-memory, NOT production) http://${listening.host}:${listening.port}\n`,
      );
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    });
}
