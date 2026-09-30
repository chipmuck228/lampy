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
  xcode_ver="$(xcodebuild -version | awk '/^Xcode /{print $2}')"
  developer_dir="${DEVELOPER_DIR:-$(xcode-select -p 2>/dev/null || true)}"
  echo "ok  Xcode: ${xcode_line}"
  echo "ok  DEVELOPER_DIR/xcode-select: ${developer_dir}"
  # Expo SDK 57 requires Xcode 26.4+ / Swift 6.3. Xcode 26.3 / Swift 6.2.4
  # fails ExpoModulesJSI JavaScriptRuntime.swift with sending 'resultPtr' data races.
  # https://github.com/expo/expo/issues/47539
  if [ -n "${xcode_ver}" ]; then
    lowest="$(printf '%s\n%s\n' "${xcode_ver}" "26.4" | sort -V | head -n 1)"
    if [ "${lowest}" != "26.4" ]; then
      echo "err Expo SDK 57 needs Xcode 26.4 or newer; this toolchain is ${xcode_ver} (${developer_dir})"
      echo "    Open /Applications/Xcode.app (26.6), not Xcode 26.3. Do not patch ExpoModulesJSI to silence Swift 6."
      fail=1
    fi
  fi
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
