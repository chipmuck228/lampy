import type {FamilySql} from './schema';
import type {FamilyAlbumRecord} from './family-album-types';
// Called inside the repository's BEGIN IMMEDIATE. Retired files are queued before rows disappear.
export async function purgeSqliteAccount(db:FamilySql,userId:string) {
 await db.run('DELETE FROM family_safety_reports WHERE reporter_user_id=? OR author_user_id=?',[userId,userId]);
 await db.run('DELETE FROM family_user_blocks WHERE user_id=? OR target_user_id=?',[userId,userId]);
 for(const table of ['family_content_moderation','family_moderation_audit'])await db.run(`DELETE FROM ${table} WHERE share_id IN (SELECT share_id FROM family_shares WHERE author_user_id=?)`,[userId]);
 await db.run('DELETE FROM family_auth_rate_limits WHERE bucket=?',['safety-report:'+userId]);
 const solo=await db.getAll<{family_id:string}>(`SELECT DISTINCT family_id FROM family_memberships m
 WHERE user_id=? AND role='creator' AND status='active' AND NOT EXISTS
 (SELECT 1 FROM family_memberships o WHERE o.family_id=m.family_id AND o.user_id<>? AND o.status='active')`,[userId,userId]);
 await db.run("DELETE FROM family_auth_rate_limits WHERE bucket IN (SELECT 'test-login:'||login_normalized FROM family_test_credentials WHERE user_id=? UNION SELECT 'email-register:'||login_normalized FROM family_test_credentials WHERE user_id=?)",[userId,userId]);
 const shares=new Set((await db.getAll<{share_id:string}>('SELECT share_id FROM family_shares WHERE author_user_id=?',[userId])).map(r=>r.share_id));
 await db.run('INSERT OR IGNORE INTO family_account_media_cleanup SELECT storage_key FROM family_media_objects WHERE owner_user_id=?',[userId]);
 for(const row of await db.getAll<{album_id:string;json:string}>('SELECT album_id,json FROM family_albums')) {
  const album=JSON.parse(row.json) as FamilyAlbumRecord;
  const ids=album.shareIds.filter(id=>!shares.has(id));
  const cover=album.coverChoice&&shares.has(album.coverChoice.shareId)?null:album.coverChoice;
  if(ids.length!==album.shareIds.length||cover!==album.coverChoice)await db.run('UPDATE family_albums SET json=? WHERE album_id=?',[JSON.stringify({...album,shareIds:ids,coverChoice:cover,revision:album.revision+1}),row.album_id]);
 }
 await db.run('DELETE FROM family_shares WHERE author_user_id=?',[userId]);
 // Membership audiences are historical JSON, not account foreign keys.
 for(const row of await db.getAll<{share_id:string;audience_json:string}>('SELECT share_id,audience_json FROM family_shares')) {
  const audience=JSON.parse(row.audience_json) as string[];
  if(audience.includes(userId))await db.run('UPDATE family_shares SET audience_json=? WHERE share_id=?',[JSON.stringify(audience.filter(id=>id!==userId)),row.share_id]);
 }
 await db.run('DELETE FROM family_album_notices WHERE json_extract(json,\'$.userId\')=?',[userId]);
 await db.run('DELETE FROM family_purchase_grants WHERE purchase_key IN (SELECT purchase_key FROM family_purchases WHERE user_id=?)',[userId]);
 for(const table of ['family_purchases','family_purchase_tokens','family_sessions','family_apple_challenges','family_user_profiles','family_test_credentials','family_login_identities','family_memberships','family_directory_history'])await db.run(`DELETE FROM ${table} WHERE user_id=?`,[userId]);
 await db.run('DELETE FROM family_creator_transfers WHERE from_user_id=? OR to_user_id=?',[userId,userId]);
 for(const table of ['family_invite_links','family_invitations'])await db.run(`UPDATE ${table} SET accepted_by_user_id=NULL WHERE accepted_by_user_id=?`,[userId]);
 await db.run('UPDATE family_families SET history_confirmed_by=NULL WHERE history_confirmed_by=?',[userId]);
 await db.run('UPDATE family_families SET dissolved_by=NULL WHERE dissolved_by=?',[userId]);
 await db.run('DELETE FROM family_idempotency WHERE user_id=? OR instr(body_json,?)>0 OR instr(request_fingerprint,?)>0',[userId,userId,userId]);
 await db.run('DELETE FROM family_media_objects WHERE owner_user_id=?',[userId]);
 for(const {family_id:id}of solo) {
  for(const table of ['family_albums','family_album_notices','family_memberships','family_directory_history','family_creator_transfers','family_invite_links','family_invitations','family_purchase_grants'])await db.run(`DELETE FROM ${table} WHERE family_id=?`,[id]);
  await db.run('DELETE FROM family_idempotency WHERE instr(body_json,?)>0',[id]);
  // Any former members' snapshots retain the established dissolved-family cleanup policy.
  // Only erase an empty family outright; otherwise close it and let the existing cleaner purge it.
  const shared=await db.getFirst('SELECT share_id FROM family_shares WHERE family_id=? LIMIT 1',[id]);
  if(shared)await db.run("UPDATE family_families SET status='dissolved',name='',dissolved_at=?,cleanup_deadline=? WHERE family_id=?",[new Date().toISOString(),new Date().toISOString(),id]);
  else await db.run('DELETE FROM family_families WHERE family_id=?',[id]);
 }
 await db.run('DELETE FROM family_accounts WHERE user_id=?',[userId]);
}
