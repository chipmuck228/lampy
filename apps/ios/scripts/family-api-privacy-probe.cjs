'use strict';
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
// Opens the existing database read-only. No migrations, application startup, media reads or HTTP.
function probe(file,now=new Date(),env={}) {
  if(!file||!Number.isFinite(now.getTime())||!fs.statSync(file).isFile())throw Error('INVALID_INPUT');
  const db=new DatabaseSync(file,{readOnly:true});
  try {
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=3000;');
    const count=(sql,...args)=>Number(db.prepare(sql).get(...args).n);
    const schema=Number(db.prepare('SELECT MAX(version) AS version FROM family_schema_migrations').get().version);
    if(schema<32)throw Error('BASELINE_TOO_OLD');
    const cutoff=new Date(now.getTime()-86400000).toISOString(),minute=new Date(now.getTime()-60000).toISOString();
    const flag=key=>env[key]===undefined?'UNKNOWN':env[key]==='1'?'ON':env[key]==='0'?'OFF':'OTHER';
    return {
      baseline:schema===32?'SCHEMA_32':'OUTSIDE_REVIEWED_BASELINE',schema,
      accounts:{total:count('SELECT COUNT(*) AS n FROM family_accounts'),nonemptyEmailRows:count("SELECT COUNT(*) AS n FROM family_accounts WHERE email IS NOT NULL AND trim(email)<>''")},
      sessions:{total:count('SELECT COUNT(*) AS n FROM family_sessions'),expired:count('SELECT COUNT(*) AS n FROM family_sessions WHERE julianday(expires_at)<=julianday(?)',now.toISOString()),invalidExpiry:count('SELECT COUNT(*) AS n FROM family_sessions WHERE julianday(expires_at) IS NULL')},
      rateBuckets:{appleSourceIP:count("SELECT COUNT(*) AS n FROM family_auth_rate_limits WHERE bucket LIKE 'apple-challenge:%'"),appleOlderThanWindow:count("SELECT COUNT(*) AS n FROM family_auth_rate_limits WHERE bucket LIKE 'apple-challenge:%' AND julianday(window_started_at)<julianday(?)",minute),appleOlderThan24h:count("SELECT COUNT(*) AS n FROM family_auth_rate_limits WHERE bucket LIKE 'apple-challenge:%' AND julianday(window_started_at)<julianday(?)",cutoff),invitePreviewHashes:count("SELECT COUNT(*) AS n FROM family_auth_rate_limits WHERE bucket LIKE 'invite-preview:%'")},
      cleanup:{pendingAccountMedia:count('SELECT COUNT(*) AS n FROM family_account_media_cleanup')},
      processFlags:{httpTrace:flag('LAMPY_FAMILY_HTTP_TRACE'),trustedAppleProxy:flag('LAMPY_APPLE_TRUST_LOOPBACK_PROXY')},
      caddyLogs:'NOT_INSPECTED',journalRetention:'NOT_INSPECTED',cloudBackups:'NOT_INSPECTED',physicalErasure:'NOT_VERIFIED',retentionPolicy:'NOT_VERIFIED',
    };
  } finally {db.close();}
}
if(require.main===module){try{console.log(JSON.stringify(probe(process.env.LAMPY_FAMILY_DATABASE_PATH,new Date(),process.env)));}catch{process.stderr.write('Privacy probe failed: check existing database path, schema and read permission. No database values are printed.\n');process.exitCode=1;}}
module.exports={probe};
