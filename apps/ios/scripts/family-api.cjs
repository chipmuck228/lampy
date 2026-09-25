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

const { startFamilyApiServer } = require(path.join(familyApiRoot, 'listen.ts'));

startFamilyApiServer()
  .then((listening) => {
    process.stdout.write(
      `Lampy family API (${process.env.LAMPY_FAMILY_API_MODE}, in-memory, NOT a production deploy) http://${listening.host}:${listening.port}\n`,
    );
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
