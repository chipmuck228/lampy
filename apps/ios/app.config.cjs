const { configure } = require('./scripts/family-internal-profile.cjs');
const { configureAlbumExport } = require('./scripts/album-export-profile.cjs');
const { configureWebsiteOpen } = require('./scripts/website-open-profile.cjs');
module.exports = ({ config }) => configureWebsiteOpen(configureAlbumExport(configure(config, process.env), process.env));
