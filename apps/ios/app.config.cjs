const { configure } = require('./scripts/family-internal-profile.cjs');
module.exports = ({ config }) => configure(config, process.env);
