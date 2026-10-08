import { INVITE_WEB_HTML, INVITE_WEB_CSS, inviteWebJs, inviteAssociation } from './invite-web';
import { invitationOrigin, makeFamilyInviteLink } from '../infrastructure/family-invite-link';
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
import { ARGON2ID_TEST, createArgon2idPasswordHasher } from './password';

export const FAMILY_JSON_MAX_BYTES = 4096;
export const FAMILY_SHARE_JSON_MAX_BYTES = 64 * 1024;

function readRawBody(req: IncomingMessage, maxBytes: number): Promise<Buffer | 'too-large'> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      if (tooLarge) return;
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
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

export async function startFamilyApiServer(options?: { port?: number; host?: string; env?: Partial<NodeJS.ProcessEnv> }) {
  const env = options?.env ?? process.env;
  const plan = planFamilyApiListen({
    LAMPY_FAMILY_API_MODE:env.LAMPY_FAMILY_API_MODE,
    LAMPY_FAMILY_API_TEST_TOKENS:env.LAMPY_FAMILY_API_TEST_TOKENS,
    LAMPY_APPLE_CLIENT_ID:env.LAMPY_APPLE_CLIENT_ID,
    LAMPY_FAMILY_DATABASE_PATH:env.LAMPY_FAMILY_DATABASE_PATH,
    LAMPY_TEST_ACCOUNT_LOGIN:env.LAMPY_TEST_ACCOUNT_LOGIN,
  });
  const inviteOrigin=invitationOrigin(env.LAMPY_FAMILY_INVITE_ORIGIN);
  const inviteEnabled=env.LAMPY_FAMILY_INVITES_ENABLED === '1' && Boolean(inviteOrigin);
  const authOpts = {
    inviteLinksEnabled:inviteEnabled,
    testAccountLoginEnabled: plan.testAccount.testAccountLoginEnabled,
    passwordHasher: plan.mode === 'test' ? createArgon2idPasswordHasher(ARGON2ID_TEST) : undefined,
  };
  const commands =
    plan.mode === 'test'
      ? createFamilyCommands({
          store: createFamilyStore(),
          apple: createMapAppleVerifier(plan.testTokens),
          mediaBlobs: createMemoryMediaBlobStore(),
          ...authOpts,
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
            ...authOpts,
          });
        })();

  const port = options?.port ?? Number(env.LAMPY_FAMILY_API_PORT || 8787);
  const host = options?.host ?? env.LAMPY_FAMILY_API_HOST ?? '127.0.0.1';

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url || '/', `http://${host}:${port}`);
      const route = url.pathname.replace(/\/+$/, '');
      res.setHeader('cache-control','no-store');
      res.setHeader('referrer-policy','no-referrer');
      res.setHeader('x-content-type-options','nosniff');
      if (inviteEnabled && req.method==='GET') {
        const assets: Record<string,[string,string]> = {
          '/invite':[INVITE_WEB_HTML,'text/html; charset=utf-8'],
          '/invite.js':[inviteWebJs(env.LAMPY_APP_STORE_URL),'application/javascript; charset=utf-8'],
          '/invite.css':[INVITE_WEB_CSS,'text/css; charset=utf-8'],
        };
        const asset=assets[route];
        if(asset) {res.setHeader('content-security-policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");res.writeHead(200,{'content-type':asset[1]});res.end(asset[0]);return;}
        if(route==='/.well-known/apple-app-site-association') { const aasa=inviteAssociation(inviteOrigin || undefined);res.writeHead(aasa ? 200 : 404,{'content-type':'application/json'});res.end(JSON.stringify(aasa || {}));return; }
      }
      const isMediaUpload = (req.method || '').toUpperCase() === 'POST' && route === '/v1/media';
      const isShareCreate = (req.method || '').toUpperCase() === 'POST' && /^\/v1\/families\/[^/]+\/shares$/.test(route);
      const maxBytes = isMediaUpload
        ? MEDIA_MAX_BYTES + 1024
        : isShareCreate
          ? FAMILY_SHARE_JSON_MAX_BYTES
          : FAMILY_JSON_MAX_BYTES;
      const raw = await readRawBody(req, maxBytes);
      if (raw === 'too-large') {
        res.writeHead(413, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: isMediaUpload
          ? { code: 'MEDIA_TOO_LARGE', message: 'Media is larger than 8 MiB.' }
          : { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } }));
        return;
      }
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
        peer:req.socket.remoteAddress || 'unknown',
      });
      if (response.status===200 && req.method==='POST' && /^\/v2\/families\/[^/]+\/invitations$/.test(route) && inviteOrigin) {
        const body=response.body as import('./types').CreatedInviteLink;
        const link=makeFamilyInviteLink(inviteOrigin,body.token);
        // Server-only encoder. QR is ephemeral; no filesystem or token log.
        const qr=await (require('qrcode') as {toDataURL(value: string): Promise<string>}).toDataURL(link);
        response.body={...body,link,qr};
      }
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
