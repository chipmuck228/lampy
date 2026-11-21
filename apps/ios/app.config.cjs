const { configure } = require('./scripts/family-internal-profile.cjs');
const { configureAlbumExport } = require('./scripts/album-export-profile.cjs');
const { configureWebsiteOpen } = require('./scripts/website-open-profile.cjs');
const { configureAndroidPersonal } = require('./scripts/android-personal-profile.cjs');
module.exports = ({ config }) => process.env.LAMPY_BUILD_PROFILE === 'android-personal' ? configureAndroidPersonal(config, process.env) : configureWebsiteOpen(configureAlbumExport(configure(config, process.env), process.env));
