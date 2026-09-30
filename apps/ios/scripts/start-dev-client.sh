#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# USB / link-local adapters (169.254.*) are reachable from the Mac but not from
# the simulator, and Expo may advertise a stale sibling address to the device.
iface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')"
host="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
if [[ -z "${host}" || "${host}" == 169.254.* ]]; then
  host="$(ifconfig | awk '/inet / && $2 !~ /^127\./ && $2 !~ /^169\.254\./ { print $2; exit }')"
fi
if [[ -n "${host}" ]]; then
  export REACT_NATIVE_PACKAGER_HOSTNAME="${host}"
  echo "Metro host ${host} (skipped 169.254 link-local)"
fi

exec ./node_modules/.bin/expo start --dev-client --port 8081 "$@"
