import type { FamilySql } from './schema';
import type { ShareSnapshot } from './types';

const DAY = 86400000;
export const FAMILY_RETENTION = { retiredContentDays: 30, orphanUploadDays: 1, rateDays: 1, reportDays: 90, auditDays: 180, adminAccessDays: 30, completedMediaReceiptDays: 30 } as const;

// Dedicated connection, bounded batches, no clock override in the operational CLI.
// Metadata retirement and durable file-queue insertion commit together. Never
// rewrite active media bytes or retain their contents in an operational report.
export async function runFamilyDataRetention(db: FamilySql, now = new Date(), limit = 100) {
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw Error('Invalid retention arguments.');
  const schema = await db.getFirst<{ version: number }>('SELECT MAX(version) AS version FROM family_schema_migrations');
  if (schema?.version !== 34) throw Error('Retention requires schema 34.');
  const at = now.toISOString();
  const before = (days: number) => new Date(now.getTime() - days * DAY).toISOString();
  const report = { completedMediaReceipts: 0, sessions: 0, challenges: 0, rateBuckets: 0, retiredShares: 0, retiredMedia: 0, resolvedReports: 0,
    moderationAudit: 0, restrictionAudit: 0, adminAccessAudit: 0, minimizedDecisions: 0, overduePendingReports: 0 };
  await db.exec('BEGIN IMMEDIATE');
  try {
    async function prune(table: string, condition: string, params: unknown[]) {
      return (await db.run(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${condition} LIMIT ?)`, [...params, limit])).changes;
    }
    report.sessions = await prune('family_sessions', 'julianday(expires_at)<=julianday(?) OR julianday(expires_at) IS NULL', [at]);
    report.challenges = await prune('family_apple_challenges', 'julianday(expires_at)<=julianday(?) OR julianday(expires_at) IS NULL', [at]);
    // All production buckets currently have windows <= one hour. Keep a full day
    // so hourly maintenance never resets an effective limiter.
    report.rateBuckets = await prune('family_auth_rate_limits', 'julianday(window_started_at)<=julianday(?) OR julianday(window_started_at) IS NULL', [before(FAMILY_RETENTION.rateDays)]);

    const retired = await db.getAll<{ share_id: string; snapshot_json: string }>(`SELECT s.share_id,s.snapshot_json FROM family_shares s
      WHERE s.content_purged_at IS NULL AND (
        (s.status='revoked' AND julianday(s.revoked_at)<=julianday(?)) OR
        EXISTS(SELECT 1 FROM family_content_moderation m WHERE m.share_id=s.share_id
          AND json_extract(m.json,'$.hidden')=1 AND julianday(json_extract(m.json,'$.updatedAt'))<=julianday(?)))
      ORDER BY s.shared_at,s.share_id LIMIT ?`, [before(FAMILY_RETENTION.retiredContentDays), before(FAMILY_RETENTION.retiredContentDays), limit]);
    for (const row of retired) {
      const snapshot = JSON.parse(row.snapshot_json) as ShareSnapshot;
      // Keep the source/revision tombstone: a delayed retry must never resurrect
      // a withdrawn/hidden snapshot. Family books may retain an unavailable slot.
      const tombstone: ShareSnapshot = { note: '', emotion: '', occurredAtPrecision: 'unknown', media: [], origin: snapshot.origin };
      await db.run("DELETE FROM family_idempotency WHERE command IN ('shareMoment','shareMoment:family-history-v2') AND json_extract(body_json,'$.shareId')=?", [row.share_id]);
      await db.run("UPDATE family_shares SET snapshot_json=?,audience_json='[]',content_purged_at=? WHERE share_id=?", [JSON.stringify(tombstone), at, row.share_id]);
      report.retiredShares++;
    }
    // Also reclaim abandoned uploads. Any remaining snapshot reference, including
    // another family or a not-yet-due retired share, keeps the object intact.
    const objects = await db.getAll<{ object_id: string; storage_key: string }>(`SELECT m.object_id,m.storage_key FROM family_media_objects m
      WHERE julianday(m.created_at)<=julianday(?) AND NOT EXISTS (
        SELECT 1 FROM family_shares s JOIN json_each(s.snapshot_json,'$.media') j
        WHERE json_extract(j.value,'$.objectId')=m.object_id)
      ORDER BY m.created_at,m.object_id LIMIT ?`, [before(FAMILY_RETENTION.orphanUploadDays), limit]);
    for (const object of objects) {
      await db.run('INSERT OR IGNORE INTO family_account_media_cleanup(storage_key) VALUES(?)', [object.storage_key]);
      await db.run("DELETE FROM family_idempotency WHERE command='uploadMedia' AND json_extract(body_json,'$.objectId')=?", [object.object_id]);
      await db.run('DELETE FROM family_media_objects WHERE object_id=?', [object.object_id]);
      report.retiredMedia++;
    }

    const resolved = await db.getAll<{ report_id: string }>(`SELECT report_id FROM family_safety_reports
      WHERE json_extract(json,'$.status') IN ('reviewed','restricted')
        AND julianday(json_extract(json,'$.retentionStartedAt'))<=julianday(?)
      ORDER BY created_at,report_id LIMIT ?`, [before(FAMILY_RETENTION.reportDays), limit]);
    for (const row of resolved) {
      await db.run("DELETE FROM family_idempotency WHERE command='safety-report' AND json_extract(body_json,'$.reportId')=?", [row.report_id]);
      await db.run('DELETE FROM family_safety_reports WHERE report_id=?', [row.report_id]);
      report.resolvedReports++;
    }
    report.moderationAudit = await prune('family_moderation_audit', "julianday(json_extract(json,'$.updatedAt'))<=julianday(?)", [before(FAMILY_RETENTION.auditDays)]);
    report.restrictionAudit = await prune('family_sharing_restriction_audit', "julianday(json_extract(json,'$.updatedAt'))<=julianday(?)", [before(FAMILY_RETENTION.auditDays)]);
    for (const table of ['family_content_moderation', 'family_sharing_restrictions']) {
      // Do not delete the enforcement state when its evidence expires. Strip
      // free-text/operator fields in the current decision as well as old audits.
      report.minimizedDecisions += (await db.run(`UPDATE ${table} SET json=json_set(json,'$.operator','','$.reason','') WHERE rowid IN (
        SELECT rowid FROM ${table} WHERE julianday(json_extract(json,'$.updatedAt'))<=julianday(?)
          AND (json_extract(json,'$.operator')<>'' OR json_extract(json,'$.reason')<>'') LIMIT ?)`, [before(FAMILY_RETENTION.auditDays), limit])).changes;
    }
    if (await db.getFirst("SELECT name FROM sqlite_master WHERE type='table' AND name='family_admin_audit'")) {
      report.adminAccessAudit = await prune('family_admin_audit', 'julianday(at)<=julianday(?)', [before(FAMILY_RETENTION.adminAccessDays)]);
    }
    const completed = await db.getAll<{storage_key:string}>("SELECT storage_key FROM family_media_cleanup WHERE julianday(completed_at)<=julianday(?) ORDER BY completed_at LIMIT ?", [before(FAMILY_RETENTION.completedMediaReceiptDays), limit]);
    for (const row of completed) {
      await db.run('DELETE FROM family_media_cleanup_families WHERE storage_key=?', [row.storage_key]);
      await db.run('DELETE FROM family_media_cleanup WHERE storage_key=?', [row.storage_key]);
      report.completedMediaReceipts++;
    }
    const pending = await db.getFirst<{ n: number }>("SELECT COUNT(*) AS n FROM family_safety_reports WHERE json_extract(json,'$.status')='pending' AND julianday(created_at)<=julianday(?)", [before(7)]);
    report.overduePendingReports = pending?.n ?? 0;
    await db.exec('COMMIT');
    return report;
  } catch (error) { await db.exec('ROLLBACK'); throw error; }
}
