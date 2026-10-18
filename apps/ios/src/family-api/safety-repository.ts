import type { FamilyStore } from './store';
import type { FamilySql } from './schema';
import type { SafetyTx, SafetyReport, UserBlock, ModerationRecord } from './safety-types';
export function memorySafetyTx(store: FamilyStore): SafetyTx {
  return {
    async listHiddenShares(familyId) { const ids=new Set(store.shares.filter(s=>s.familyId===familyId).map(s=>s.shareId));return store.moderation.filter(r=>r.hidden&&ids.has(r.shareId)).map(r=>r.shareId); },
    async listSafetyReports(userId) { return store.safetyReports.filter(r => !userId || r.reporterUserId === userId).map(r => ({ ...r })); },
    async findSafetyReport(id) { const r = store.safetyReports.find(r => r.reportId === id); return r ? { ...r } : null; },
    async saveSafetyReport(row) { store.safetyReports = store.safetyReports.filter(r => r.reportId !== row.reportId).concat({ ...row }); },
    async listUserBlocks(userId) { return store.userBlocks.filter(r => r.userId === userId).map(r => ({ ...r })); },
    async saveUserBlock(row) { if (!store.userBlocks.some(r => r.userId === row.userId && r.targetUserId === row.targetUserId)) store.userBlocks.push({ ...row }); },
    async deleteUserBlock(userId, targetUserId) { store.userBlocks = store.userBlocks.filter(r => r.userId !== userId || r.targetUserId !== targetUserId); },
    async findModeration(shareId) { return store.moderation.find(r => r.shareId === shareId) ?? null; },
    async saveModeration(row) { store.moderation = store.moderation.filter(r => r.shareId !== row.shareId).concat({ ...row }); store.moderationAudit.push({ ...row }); },
  };
}
export function sqliteSafetyTx(db: FamilySql): SafetyTx {
  async function rows<T>(sql: string, params: unknown[] = []) { return (await db.getAll<{ json: string }>(sql, params)).map(r => JSON.parse(r.json) as T); }
  return {
    async listHiddenShares(familyId) { return (await db.getAll<{share_id:string}>("SELECT m.share_id FROM family_content_moderation m JOIN family_shares s ON s.share_id=m.share_id WHERE s.family_id=? AND json_extract(m.json,'$.hidden')=1",[familyId])).map(r=>r.share_id); },
    listSafetyReports(userId) { return rows<SafetyReport>('SELECT json FROM family_safety_reports' + (userId ? ' WHERE reporter_user_id=?' : '') + ' ORDER BY created_at DESC', userId ? [userId] : []); },
    async findSafetyReport(id) { return (await rows<SafetyReport>('SELECT json FROM family_safety_reports WHERE report_id=?', [id]))[0] ?? null; },
    async saveSafetyReport(r) { await db.run('INSERT INTO family_safety_reports(report_id,reporter_user_id,author_user_id,share_id,created_at,json) VALUES (?,?,?,?,?,?) ON CONFLICT(report_id) DO UPDATE SET json=excluded.json', [r.reportId,r.reporterUserId,r.authorUserId,r.shareId,r.createdAt,JSON.stringify(r)]); },
    listUserBlocks(userId) { return rows<UserBlock>('SELECT json FROM family_user_blocks WHERE user_id=? ORDER BY target_user_id', [userId]); },
    async saveUserBlock(r) { await db.run('INSERT OR IGNORE INTO family_user_blocks(user_id,target_user_id,json) VALUES (?,?,?)', [r.userId,r.targetUserId,JSON.stringify(r)]); },
    async deleteUserBlock(userId, target) { await db.run('DELETE FROM family_user_blocks WHERE user_id=? AND target_user_id=?',[userId,target]); },
    async findModeration(id) { return (await rows<ModerationRecord>('SELECT json FROM family_content_moderation WHERE share_id=?',[id]))[0] ?? null; },
    async saveModeration(r) { await db.run('INSERT INTO family_content_moderation(share_id,json) VALUES (?,?) ON CONFLICT(share_id) DO UPDATE SET json=excluded.json',[r.shareId,JSON.stringify(r)]); await db.run('INSERT INTO family_moderation_audit(share_id,json) VALUES (?,?)',[r.shareId,JSON.stringify(r)]); },
  };
}
