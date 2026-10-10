import type { FamilySql } from './schema';
import type { MediaBlobStore } from './media-blobs';

// Use a dedicated connection. SQLite's write lock serializes purging against sharing/upload metadata.
// File deletion runs after durable metadata retirement, so a failed file delete can be retried after restart.
export async function runFamilyCleanup(db: FamilySql, blobs: MediaBlobStore, now = new Date(), limit = 20) {
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid cleanup arguments.');
  const at = now.toISOString();
  const due = await db.getAll<{ family_id: string }>(`SELECT family_id FROM family_families
    WHERE status='dissolved' AND cleanup_deadline <= ? AND cleaned_at IS NULL
    ORDER BY cleanup_deadline, family_id LIMIT ?`, [at, limit]);
  const report = { checked: due.length, completed: 0, failed: 0, removedFiles: 0 };
  async function transaction<T>(work: () => Promise<T>) {
    await db.exec('BEGIN IMMEDIATE');
    try { const result = await work(); await db.exec('COMMIT'); return result; }
    catch (error) { await db.exec('ROLLBACK'); throw error; }
  }
  for (const { family_id: id } of due) {
    try {
      await transaction(async () => {
        const family = await db.getFirst<{ snapshots_purged_at: string | null }>(`SELECT snapshots_purged_at FROM family_families
          WHERE family_id=? AND status='dissolved' AND cleanup_deadline<=? AND cleaned_at IS NULL`, [id, at]);
        if (!family) return;
        await db.run('UPDATE family_families SET cleanup_attempts=cleanup_attempts+1, cleanup_error=NULL WHERE family_id=?', [id]);
        if (family.snapshots_purged_at) return;
        const objects = await db.getAll<{ object_id: string; storage_key: string }>(`SELECT DISTINCT m.object_id,m.storage_key
          FROM family_media_objects m JOIN family_shares s ON s.family_id=?
          JOIN json_each(s.snapshot_json,'$.media') j ON json_extract(j.value,'$.objectId')=m.object_id
          WHERE NOT EXISTS (SELECT 1 FROM family_shares other JOIN family_families f ON f.family_id=other.family_id
            JOIN json_each(other.snapshot_json,'$.media') ref ON json_extract(ref.value,'$.objectId')=m.object_id
            WHERE other.family_id<>? AND other.status='active' AND f.status='active')
          UNION SELECT q.object_id,q.storage_key FROM family_media_cleanup q JOIN family_shares s ON s.family_id=?
            JOIN json_each(s.snapshot_json,'$.media') j ON json_extract(j.value,'$.objectId')=q.object_id`, [id, id, id]);
        for (const object of objects) {
          await db.run('INSERT OR IGNORE INTO family_media_cleanup(storage_key,object_id,family_id) VALUES(?,?,?)', [object.storage_key, object.object_id, id]);
          await db.run('INSERT OR IGNORE INTO family_media_cleanup_families(storage_key,family_id) VALUES(?,?)', [object.storage_key, id]);
          // Remove upload receipts too: an old response must not reference retired bytes.
          await db.run("DELETE FROM family_idempotency WHERE command='uploadMedia' AND json_extract(body_json,'$.objectId')=?", [object.object_id]);
          await db.run('DELETE FROM family_media_objects WHERE object_id=?', [object.object_id]);
        }
        // Snapshots also live in idempotency responses; deleting only the feed would leave full copies.
        // Keep only a closed-operation receipt for creation: a delayed retry must not create another family.
        await db.run(`UPDATE family_idempotency SET request_fingerprint='',body_json=json_object('familyId',?,'retired','family-dissolved')
          WHERE command IN ('createFamily','createNamedFamily') AND json_extract(body_json,'$.familyId')=?`, [id, id]);
        await db.run("DELETE FROM family_idempotency WHERE command NOT IN ('createFamily','createNamedFamily') AND json_extract(body_json,'$.familyId')=?", [id]);
        await db.run('DELETE FROM family_shares WHERE family_id=?', [id]);
        await db.run('DELETE FROM family_invite_links WHERE family_id=?', [id]);
        await db.run('DELETE FROM family_invitations WHERE family_id=?', [id]);
        await db.run('DELETE FROM family_creator_transfers WHERE family_id=?', [id]);
        await db.run('DELETE FROM family_memberships WHERE family_id=?', [id]);
        await db.run("UPDATE family_families SET name='',history_confirmed_by=NULL,snapshots_purged_at=? WHERE family_id=?", [at, id]);
      });
      const files = await db.getAll<{ storage_key: string }>(`SELECT q.storage_key FROM family_media_cleanup q JOIN family_media_cleanup_families f ON f.storage_key=q.storage_key WHERE f.family_id=? AND q.completed_at IS NULL`, [id]);
      for (const file of files) {
        // Fail closed if the key is unexpectedly reused; never remove a live object's file.
        if (await db.getFirst('SELECT object_id FROM family_media_objects WHERE storage_key=?', [file.storage_key])) throw new Error('Storage key reused.');
        await db.run('UPDATE family_media_cleanup SET attempts=attempts+1 WHERE storage_key=?', [file.storage_key]);
        try {
          await blobs.remove(file.storage_key);
          await db.run('UPDATE family_media_cleanup SET completed_at=?,last_error=NULL WHERE storage_key=?', [at, file.storage_key]);
          report.removedFiles++;
        } catch {
          await db.run("UPDATE family_media_cleanup SET last_error='MEDIA_REMOVE_FAILED' WHERE storage_key=?", [file.storage_key]);
          throw new Error('Media removal failed.');
        }
      }
      const result = await db.run(`UPDATE family_families SET cleaned_at=?,cleanup_error=NULL
        WHERE family_id=? AND snapshots_purged_at IS NOT NULL AND cleaned_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM family_media_cleanup q JOIN family_media_cleanup_families f ON f.storage_key=q.storage_key WHERE f.family_id=? AND q.completed_at IS NULL)`, [at, id, id]);
      report.completed += result.changes;
    } catch {
      report.failed++;
      await db.run("UPDATE family_families SET cleanup_error='CLEANUP_FAILED' WHERE family_id=? AND cleaned_at IS NULL", [id]);
    }
  }
  return report;
}
