# Authenticated read probe (operator only)

User observations: Mac direct health 200 ~0.55s / unauthenticated directory 401 ~0.64s; server loopback equivalents <1ms; simulator Safari health repeatedly fast. Proxy exception + full App restart did not eliminate DIRECTORY_HTTP / SERVER_UNREACHABLE ~5020ms. This does not certify authenticated queries or prove a proxy/SQLite/native-network cause. No further timeout relaxation is justified by these observations.

`scripts/family-api-read-probe.cjs` is a standalone Node 22+ operator diagnostic. No App, service, dependency, migration, Caddy or database configuration change is required. Upload only this file and run it with the running service's Node binary, User and EnvironmentFile. The service stays running so the probe observes the failing period.

Required environment: LAMPY_FAMILY_DATABASE_PATH (absolute existing SQLite file), FAMILY_PROBE_EMAIL (the operator's specified currently signed-in test account email). LAMPY_FAMILY_API_PORT defaults to 8788. The DB opens read-only; select an unexpired session only for that account via account email or controlled credential login. No fallback to another user's session or new login attempt. No password entry and no session/token copying into chat, command arguments or logs.

GET-only targets: 127.0.0.1 at configured API port, then fixed https://family-test.yunpura.com; directory followed by concurrent per-family album lists (max10). Redirects are rejected to keep the credential bound to the expected origins. HTTP default 10s deadline with AbortController and logical race. Outputs probe ordinal/label, status, elapsed ms and optional whitelisted server error code, never response bodies, family/user identifiers, emails, names, opening/body text, or tokens. Transport errors are normalized. Choosing an existing session is diagnostic only and does not certify the exact simulator session is identical.

Mac transfer:

```bash
cd /Users/zhen/WeChatProjects/lampy-life-album-family-e
# Fetch the commit that adds this script; no Metro reload required.
scp apps/ios/scripts/family-api-read-probe.cjs ubuntu@62.234.102.33:/home/ubuntu/lampy-family-read-probe.cjs
```

Cloud execution (Ubuntu bash):

```bash
sudo install -m 0644 /home/ubuntu/lampy-family-read-probe.cjs /opt/lampy-family-test/apps/ios/scripts/family-api-read-probe.cjs
family_api_pid="$(sudo systemctl show lampy-family-test.service --property=MainPID --value)"
family_api_node="$(sudo readlink -f "/proc/${family_api_pid}/exe")"
family_service_user="$(sudo systemctl show lampy-family-test.service --property=User --value)"
read -r -p 'Current Lampy test account email: ' family_probe_email
sudo systemd-run \
  --unit="lampy-family-read-probe-$(date +%s)" \
  --wait --pipe --collect \
  "--property=User=${family_service_user:-root}" \
  --property=EnvironmentFile=/etc/lampy/family-test.env \
  "--setenv=FAMILY_PROBE_EMAIL=${family_probe_email}" \
  "$family_api_node" /opt/lampy-family-test/apps/ios/scripts/family-api-read-probe.cjs
unset family_probe_email
```

Interpretation: slow local authenticated responses implicate service/auth/DB contention; fast local but slow server-side HTTPS implicates public/reverse-proxy path; both fast narrows focus to simulator/App routing or concurrency, without ruling out intermittent backend behavior. 401 means the selected session/account is no longer admitted; rules-required 409 is expected for an unacknowledged family. NO_ACTIVE_SESSION_FOR_EMAIL requires the exact test account email, never printing or manually sharing a token. Request results are NOT yet collected.

Validation: `node --test scripts/family-api-read-probe.test.cjs` 3 tests pass: targeted unexpired session/read-only DB, GET/fixed-origin/no redirects/output privacy, bounded fetch and raw error redaction. No simulator or live authenticated-service PASS claimed.
