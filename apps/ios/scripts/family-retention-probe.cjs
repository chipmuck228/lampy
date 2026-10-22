'use strict';
// Read-only aggregate inventory. No accounts, tokens, bucket keys, text or file paths.
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
function inspect(database,now=new Date()) {
 if(!Number.isFinite(now.getTime())||!database||!fs.statSync(database).isFile())throw Error('INPUT');
 const db=new DatabaseSync(database,{readOnly:true});
 try {
  db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=3000; BEGIN;');
  const schema=Number(db.prepare('SELECT MAX(version) AS version FROM family_schema_migrations').get().version);
  if(![33,34].includes(schema))throw Error('SCHEMA');
  const before=days=>new Date(now.getTime()-days*86400000).toISOString();
  const count=(sql,...args)=>Number(db.prepare('SELECT COUNT(*) AS n '+sql).get(...args).n);
  const purged=schema===34?'s.content_purged_at IS NULL':'1=1';
  const result={mode:'READ_ONLY',schema,
   expiredSessions:count('FROM family_sessions WHERE julianday(expires_at)<=julianday(?) OR julianday(expires_at) IS NULL',now.toISOString()),
   expiredChallenges:count('FROM family_apple_challenges WHERE julianday(expires_at)<=julianday(?) OR julianday(expires_at) IS NULL',now.toISOString()),
   oldRateBuckets:count('FROM family_auth_rate_limits WHERE julianday(window_started_at)<=julianday(?) OR julianday(window_started_at) IS NULL',before(1)),
   dueRetiredShares:count(`FROM family_shares s WHERE ${purged} AND ((s.status='revoked' AND julianday(s.revoked_at)<=julianday(?)) OR EXISTS(SELECT 1 FROM family_content_moderation m WHERE m.share_id=s.share_id AND json_extract(m.json,'$.hidden')=1 AND julianday(json_extract(m.json,'$.updatedAt'))<=julianday(?)))`,before(30),before(30)),
   dueUnreferencedMedia:count("FROM family_media_objects m WHERE julianday(m.created_at)<=julianday(?) AND NOT EXISTS(SELECT 1 FROM family_shares s JOIN json_each(s.snapshot_json,'$.media') j WHERE json_extract(j.value,'$.objectId')=m.object_id)",before(1)),
   pendingFileRemovals:count('FROM family_account_media_cleanup'),
   pendingDissolvedFileRemovals:count('FROM family_media_cleanup WHERE completed_at IS NULL'),
   dueCompletedMediaReceipts:count('FROM family_media_cleanup WHERE julianday(completed_at)<=julianday(?)',before(30)),
   dueResolvedReports:count("FROM family_safety_reports WHERE json_extract(json,'$.status') IN ('reviewed','restricted') AND julianday(json_extract(json,'$.retentionStartedAt'))<=julianday(?)",before(90)),
   resolvedWithoutAnchor:count("FROM family_safety_reports WHERE json_extract(json,'$.status') IN ('reviewed','restricted') AND julianday(json_extract(json,'$.retentionStartedAt')) IS NULL"),
   overduePendingReports:count("FROM family_safety_reports WHERE json_extract(json,'$.status')='pending' AND julianday(created_at)<=julianday(?)",before(7)),
   dueModerationAudit:count("FROM family_moderation_audit WHERE julianday(json_extract(json,'$.updatedAt'))<=julianday(?)",before(180)),
   dueRestrictionAudit:count("FROM family_sharing_restriction_audit WHERE julianday(json_extract(json,'$.updatedAt'))<=julianday(?)",before(180)),
   physicalErasure:'NOT_VERIFIED',backups:'NOT_INSPECTED'};
  result.dueAdminAccessAudit=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='family_admin_audit'").get()?count('FROM family_admin_audit WHERE julianday(at)<=julianday(?)',before(30)):0;
  db.exec('ROLLBACK;');return result;
 }finally{db.close();}
}
if(require.main===module){try{if(process.argv.length!==2)throw Error('ARGUMENTS');process.stdout.write(JSON.stringify(inspect(process.env.LAMPY_FAMILY_DATABASE_PATH))+'\n');}catch{process.stderr.write('Retention probe failed. Check existing schema 33/34 database and read permissions.\n');process.exitCode=1;}}
module.exports={inspect};
