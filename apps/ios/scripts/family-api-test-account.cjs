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

const { runTestAccountCli } = require(path.join(familyApiRoot, 'test-account-cli.ts'));

runTestAccountCli({ argv: process.argv, env: process.env })
  .then((line) => {
    process.stdout.write(`${line}\n`);
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
