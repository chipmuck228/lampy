# Correlating one App timeout with the service

Status: NOT RESOLVED. User reports the family list still cycles DIRECTORY_HTTP timeout (~5021ms) and 15s expiry after proxy bypass, cold App/Metro restart and EXPO_PUBLIC_USE_RN_FETCH=1. The official Expo SDK57 body-reader issue is a plausible dependency risk, not an established explanation of this incident.

User's operator probe for the specified current test account returned local directory200/46ms, five concurrent lists200/8–12ms; server-side HTTPS directory200/738ms, concurrent lists200/557–1203ms. This is a short observation window, not a guarantee against intermittent backend contention or the exact simulator session. Health/Safari/unauthenticated checks cannot diagnose authenticated App response reading.

## Added observations

Development App + FAMILY_ALBUM_EVAL only: selected directory/access/list/validate requests carry a process-random diagnostic ID `diag-<16 hex>-<counter>`. No IDs are derived from account, family, session or content. Timeout errors preserve this ID through the API/use-case wrappers into the existing list diagnostic. `wait=HEADERS` means fetch has not returned response headers; `wait=TEXT http=200` means headers/status arrived and buffered text reading has not completed; BYTES labels buffered media reads. `engine=RN` recognizes the whatwg-fetch polyfill marker; OTHER is unrecognized and must not be asserted to be Expo (wrappers may also obscure the marker); INJECTED is for tests. rnRequested records the environment request, not proof of execution.

API trace is OFF unless LAMPY_FAMILY_HTTP_TRACE=1. Only supported route classes and correctly formatted diagnostic IDs are traced. Logs record ID, constant route class, START/FINISH/DISCONNECT, status and elapsed ms; never paths/query strings, user/family IDs, names, request/response bodies, authorization, passwords, or tokens. Logging failure cannot change API responses. Response echoes the safe ID. Normal requests/invalid IDs are not logged. This is temporary diagnostics; no timeout/lease/authorization relaxation and no session changes.

Interpretation for the SAME ID: no START suggests the request did not reach this instrumented API (first verify trace configuration); START then slow FINISH/DISCONNECT suggests server/upstream delay; fast FINISH200 but App HEADERS timeout suggests the response path/native delivery; fast FINISH200 but App TEXT timeout narrows focus to body delivery/reading. None alone proves a specific networking library defect. A fresh success after failure can clear the diagnostic; capture it while present.

## Mac: code and two-file server archive

```bash
cd /Users/zhen/WeChatProjects/lampy-life-album-family-e
git -c http.proxy=http://127.0.0.1:7897 fetch origin
git switch --detach origin/ios/life-album-family-e
git archive --format=tar.gz --output=/tmp/lampy-family-http-trace.tar.gz HEAD \
  apps/ios/src/family-api/listen.ts apps/ios/src/family-api/http-trace.ts
scp /tmp/lampy-family-http-trace.tar.gz ubuntu@62.234.102.33:/home/ubuntu/
```

## Cloud: enable only temporary diagnostics

```bash
sudo bash <<'SH'
set -e
family_trace_backup="/var/backups/lampy-family-trace-$(date +%s)"
install -d -m 0700 "$family_trace_backup"
cp -p /opt/lampy-family-test/apps/ios/src/family-api/listen.ts /etc/lampy/family-test.env "$family_trace_backup/"
printf 'Backup: %s\n' "$family_trace_backup"
tar --no-same-owner -xzf /home/ubuntu/lampy-family-http-trace.tar.gz -C /opt/lampy-family-test
sed -i '/^LAMPY_FAMILY_HTTP_TRACE=/d' /etc/lampy/family-test.env
printf '\nLAMPY_FAMILY_HTTP_TRACE=1\n' >> /etc/lampy/family-test.env
systemctl restart lampy-family-test.service
systemctl is-active lampy-family-test.service
SH
```

No npm/dependencies/migration/native build. Only two server source files are updated. Keep Metro running with the same environment; press r to load the client changes. When the error occurs, copy the App diagnostic with rid, wait, http, engine/rnRequested, then collect matching recent logs:

```bash
sudo journalctl -u lampy-family-test.service --since "3 minutes ago" \
  --no-pager -g 'family-http-trace' -n 60
```

When the ID is available, -g can instead match that exact diagnostic ID. Logs remain content/credential-free. Send the error diagnostic and logs together; no token export required.

## Disable / rollback

Disable temporary request logging (retain client diagnostic capability):

```bash
sudo sed -i '/^LAMPY_FAMILY_HTTP_TRACE=/d' /etc/lampy/family-test.env
sudo systemctl restart lampy-family-test.service
```

If the two-file update fails, restore listen.ts from the printed /var/backups/lampy-family-trace-* backup directory and restart; the additional helper is unused by the restored entry. Preserve any later intentional env changes rather than restoring the entire backup blindly. Service status/journal should be checked on a failed restart.

Verification covers header-vs-body stalls, preserving error context, RN marker/environment distinction, real local HTTP trace echo/arrival/completion, ID whitelist, log privacy, disable switch and logger failures. Live correlated results are still pending.

Checks: 5 suites / 37 tests pass; TypeScript and changed-file ESLint have no errors. listen.ts retains its pre-existing qrcode require-style lint warning. This verifies correlation plumbing, not the live simulator root cause.
