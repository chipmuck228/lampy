'use strict';
// Aggregates only. No migration, HTTP, identifiers, IPs, tokens or content output.
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
function inspect(databasePath, now = Date.now()) {
  if (!databasePath || !fs.statSync(databasePath).isFile()) throw new Error('DATABASE_REQUIRED');
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    db.exec('PRAGMA query_only=ON; BEGIN');
    const schema = db.prepare('SELECT MAX(version) AS version FROM family_schema_migrations').get().version;
    if (schema !== 33) throw new Error('SCHEMA_33_REQUIRED');
    const count = table => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    const cutoff = new Date(now - 86400000).toISOString();
    const rates = db.prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN julianday(window_started_at)<julianday(?) THEN 1 ELSE 0 END),0) AS olderThan24h,
      COALESCE(SUM(CASE WHEN julianday(window_started_at) IS NULL THEN 1 ELSE 0 END),0) AS invalidTime
      FROM family_auth_rate_limits WHERE bucket LIKE 'apple-challenge:%'`).get(cutoff);
    return {
      probe: 'FIRST_PARTY_DISCLOSURE', mode: 'READ_ONLY', schema,
      accounts: {total: count('family_accounts'), nonemptyEmailRows: db.prepare("SELECT COUNT(*) AS n FROM family_accounts WHERE email IS NOT NULL AND length(trim(email))>0").get().n},
      relationships: {memberships: count('family_memberships'), blocks: count('family_user_blocks'), invitations: count('family_invite_links')},
      content: {shares: count('family_shares'), media: count('family_media_objects'), albums: count('family_albums')},
      safety: {reports: count('family_safety_reports'), moderationAudit: count('family_moderation_audit'), restrictionAudit: count('family_sharing_restriction_audit')},
      appleRateBuckets: {...rates},
      purchaseRows: count('family_purchases'),
      privateValues: 'NOT_PRINTED', retentionDeletion: 'NOT_VERIFIED',
      productionFlags: 'NOT_INSPECTED', historicalPhotoMetadata: 'NOT_INSPECTED'
    };
  } finally { db.close(); }
}
module.exports = {inspect};
if (require.main === module) {
  try { console.log(JSON.stringify(inspect(process.env.LAMPY_FAMILY_DATABASE_PATH))); }
  catch { console.error(JSON.stringify({probe:'FIRST_PARTY_DISCLOSURE',result:'FAILED',reason:'CHECK_EXISTING_DATABASE_AND_SCHEMA_33'})); process.exitCode=1; }
}
