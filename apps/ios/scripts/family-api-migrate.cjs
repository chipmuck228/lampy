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
  process.stderr.write('Set LAMPY_FAMILY_DATABASE_PATH to the SQLite file before migrating.\n');
  process.exit(1);
}

const { mkdirSync } = require('node:fs');
mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });

const { openFamilySqliteDatabase } = require(path.join(familyApiRoot, 'node-db.ts'));
const { applyFamilyApiSchema } = require(path.join(familyApiRoot, 'schema.ts'));

const db = openFamilySqliteDatabase(databasePath);
applyFamilyApiSchema(db)
  .then(() => {
    process.stdout.write(`Applied family API migrations to ${databasePath}\n`);
    return db.close();
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
