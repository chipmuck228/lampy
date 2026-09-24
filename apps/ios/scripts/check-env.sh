#!/usr/bin/env bash
set -euo pipefail

echo "Lampy iOS environment check"
echo "cwd: $(pwd)"
echo

fail=0

need() {
  if command -v "$1" >/dev/null 2>&1; then
    echo "ok  $1: $($1 --version 2>/dev/null | head -n 1)"
  else
    echo "err $1: missing"
    fail=1
  fi
}

need node
need npm
need xcodebuild
need xcrun

if xcodebuild -version >/dev/null 2>&1; then
  xcode_line="$(xcodebuild -version | tr '\n' ' ')"
  echo "ok  Xcode: ${xcode_line}"
else
  echo "err Xcode command line tools not ready"
  fail=1
fi

if xcrun simctl list devices available >/dev/null 2>&1; then
  echo "ok  simctl available"
else
  echo "err simctl cannot list devices"
  fail=1
fi

if command -v pod >/dev/null 2>&1; then
  echo "ok  pod: $(pod --version)"
else
  echo "warn CocoaPods not found (needed for Development Build)"
fi

if [ -f package.json ]; then
  echo "ok  apps/ios/package.json present"
else
  echo "err run this script from apps/ios"
  fail=1
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "Environment check passed."
  exit 0
fi

echo "Environment check failed."
exit 1
