const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '../..');
const domainRoot = path.resolve(repoRoot, 'domain');
const projectionsRoot = path.resolve(repoRoot, 'projections');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [domainRoot, projectionsRoot];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@lampy/domain': domainRoot,
  '@lampy/projections': projectionsRoot,
};
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const aliasRoot = moduleName.startsWith('@lampy/domain/')
    ? domainRoot
    : moduleName.startsWith('@lampy/projections/')
      ? projectionsRoot
      : null;
  if (aliasRoot) {
    const suffix = moduleName.replace(/^@lampy\/(domain|projections)\//, '');
    const filePath = path.resolve(aliasRoot, suffix);
    if (fs.existsSync(filePath)) {
      return { type: 'sourceFile', filePath };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
