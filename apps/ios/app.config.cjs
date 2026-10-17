const { configure } = require('./scripts/family-internal-profile.cjs');
const { configureAlbumExport } = require('./scripts/album-export-profile.cjs');
module.exports = ({ config }) => configureAlbumExport(configure(config, process.env), process.env);
