#!/usr/bin/env bash
# Run on Ubuntu with sudo. Updates one static-web source module, never the backend/database/env.
set -Eeuo pipefail
mode="${1:---check}"
source_file="${2:-}"
[[ "$mode" == --check || "$mode" == --apply ]] || { echo 'Usage: sudo bash deploy-invite-web-test.sh --check|--apply /tmp/invite-web.ts'; exit 2; }
[[ "$(id -u)" == 0 ]] || { echo 'Run with sudo on the Ubuntu test server.'; exit 2; }
[[ -f "$source_file" ]] || { echo 'Invitation source file is missing.'; exit 2; }
expected=e299071ee1b47ad9ee0312de964d8b516a0254f4beabb24cbf93fcd7fa403d5b
[[ "$(sha256sum "$source_file" | cut -d' ' -f1)" == "$expected" ]] || { echo 'Unexpected invitation source version; nothing changed.'; exit 2; }
unit=lampy-family-test.service
systemctl is-active --quiet "$unit"
working="$(systemctl show "$unit" -p WorkingDirectory --value)"
[[ "$working" == /opt/*/apps/ios ]] || { echo 'Unexpected test service directory; nothing changed.'; exit 2; }
working="$(realpath -e "$working")"
target="$(realpath -e "$working/src/family-api/invite-web.ts")"
[[ "$target" == "$working/src/family-api/invite-web.ts" ]] || { echo 'Refusing a source symlink outside the test tree.'; exit 2; }
# Detect production services sharing this file, including through a symlink.
for other in lampy-family.service lampy-family-admin.service; do
 other_dir="$(systemctl show "$other" -p WorkingDirectory --value 2>/dev/null || true)"
 if [[ -n "$other_dir" && -f "$other_dir/src/family-api/invite-web.ts" ]]; then
  [[ "$(realpath -e "$other_dir/src/family-api/invite-web.ts")" != "$target" ]] || { echo 'Test and production share this source; isolated deployment is required.'; exit 2; }
 fi
done
# This deployment supports the existing TypeScript-on-start runner only.
exec_spec="$(systemctl show "$unit" -p ExecStart --value)"
[[ "$exec_spec" == *"$working/scripts/family-api.cjs"* ]] || { echo 'Unexpected test runner; nothing changed.'; exit 2; }
command -v node >/dev/null
node - "$working" "$source_file" <<'JS'
const fs=require('node:fs'),path=require('node:path');
const ts=require(path.join(process.argv[2],'node_modules/typescript'));
const result=ts.transpileModule(fs.readFileSync(process.argv[3],'utf8'),{reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
if((result.diagnostics||[]).some(d=>d.category===ts.DiagnosticCategory.Error))process.exit(1);
new (require('node:vm').Script)(result.outputText);
JS
health(){ curl -fsS --max-time 5 http://127.0.0.1:8788/health | python3 -c 'import sys,json;sys.exit(0 if json.load(sys.stdin).get("ok") is True else 1)'; }
health
printf 'TEST_WEB_PREFLIGHT_OK service=%s\n' "$unit"
[[ "$mode" == --apply ]] || exit 0
backup_dir="$(mktemp -d /var/backups/lampy-invite-web.XXXXXXXX)"
cp -a "$target" "$backup_dir/invite-web.ts"
rollback(){
 trap - ERR INT TERM
 echo 'DEPLOY_FAILED: restoring previous invitation source.' >&2
 cp -a "$backup_dir/invite-web.ts" "$target"
 systemctl restart "$unit" || true
 echo "Previous source restored. Backup: $backup_dir. Check test service status." >&2
 exit 1
}
trap rollback ERR INT TERM
next_file="$(mktemp "${target}.next.XXXXXXXX")"
cat "$source_file" > "$next_file"
chmod --reference="$target" "$next_file"
chown --reference="$target" "$next_file"
mv "$next_file" "$target"
systemctl restart "$unit"
healthy=false
for attempt in {1..15}; do
 if health >/dev/null 2>&1; then healthy=true;break;fi
 sleep 2
done
[[ "$healthy" == true ]]
# Public GETs only; never create, preview, accept, pay or delete a real account/invitation.
for base in http://127.0.0.1:8788 https://family-test.yunpura.com; do
 curl -fsS --max-time 15 "$base/invite" | python3 -c 'import sys;s=sys.stdin.read();assert "id=\"copy\"" in s and "id=\"wechat\"" in s and "id=\"invite-link\"" in s'
 curl -fsS --max-time 15 "$base/invite.js" | python3 -c 'import sys;s=sys.stdin.read();assert "navigator.clipboard" in s and "const download=\"\"" in s'
done
trap - ERR INT TERM
printf 'TEST_INVITE_WEB_DEPLOYED backup=%s\n' "$backup_dir"
echo 'Only lampy-family-test.service was restarted. Web device acceptance is still required.'
