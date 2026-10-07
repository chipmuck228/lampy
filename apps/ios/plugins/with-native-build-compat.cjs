'use strict';
const { withPodfile } = require('expo/config-plugins');
const line = "ENV['EXPO_USE_PRECOMPILED_MODULES'] = '0'";
function configurePodfile(contents) {
  const cleaned = contents.replace(/^ENV\[['"]EXPO_USE_PRECOMPILED_MODULES['"]\]\s*=.*\r?\n/gm, '');
  return `${line}\n${cleaned}`;
}
module.exports = config => withPodfile(config, mod => {
  mod.modResults.contents = configurePodfile(mod.modResults.contents);
  return mod;
});
module.exports.configurePodfile = configurePodfile;
