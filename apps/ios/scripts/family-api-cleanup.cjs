const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const familyApiRoot = path.join(__dirname, '../src/family-api');

function transpile(filename) {
  const source = fs.readFileSync(filename, 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

Module._extensions['.ts'] = function compileTypescript(module, filename) {
  module._compile(transpile(filename), filename);
};

const databasePath = (process.env.LAMPY_FAMILY_DATABASE_PATH || '').trim();
if (!databasePath) {
  process.stderr.write('Set LAMPY_FAMILY_DATABASE_PATH to the SQLite file before cleanup.\n');
  process.exit(1);
}

const { openFamilySqliteDatabase } = require(path.join(familyApiRoot, 'node-db.ts'));

const { createDirectoryMediaBlobStore } = require(path.join(familyApiRoot, 'media-blobs.ts'));
const { runFamilyCleanup } = require(path.join(familyApiRoot, 'family-cleanup.ts'));
const mediaPath = (process.env.LAMPY_FAMILY_MEDIA_PATH || '').trim();
if (!mediaPath) { process.stderr.write('Set LAMPY_FAMILY_MEDIA_PATH to the API media directory.\n'); process.exit(1); }
if (!fs.existsSync(databasePath) || !fs.statSync(databasePath).isFile() || !fs.existsSync(mediaPath) || !fs.statSync(mediaPath).isDirectory()) {
  process.stderr.write('Cleanup requires the existing API database and media directory.\n'); process.exit(1);
}
const db = openFamilySqliteDatabase(databasePath);
(async () => {
  try {
    const schema = await db.getFirst('SELECT MAX(version) AS version FROM family_schema_migrations');
    if (!schema || schema.version < 23) { process.stderr.write('Run family-api:migrate before cleanup (schema 23 required).\n'); process.exitCode = 1; return; }
    const report = await runFamilyCleanup(db, createDirectoryMediaBlobStore(mediaPath));
    process.stdout.write(JSON.stringify(report) + '\n');
    if (report.failed) process.exitCode = 1;
  } catch { process.stderr.write('Family cleanup failed; check the isolated service/database configuration.\n'); process.exitCode = 1; }
  finally { await db.close(); }
})();
