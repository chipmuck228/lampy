#!/usr/bin/env bash
# Prepare a local Release Archive for TestFlight. Does not upload or submit.
# Do not source this file or release-public-env.sh in a developer shell.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
cd "$ROOT"

if [[ "${1:-}" == "--inspect" ]]; then
  node "$ROOT/scripts/inspect-release-archive.cjs" "${2:-${LAMPY_ARCHIVE_OUT:-/tmp/lampy-testflight-beta-1}/Lampy.xcarchive}"
  exit $?
fi

# shellcheck source=./release-public-env.sh
source "$ROOT/scripts/release-public-env.sh"

STASH="$(mktemp -d /tmp/lampy-dotenv-stash.XXXXXX)"
RESTORE_DONE=0
restore_dotenv() {
  if [[ "$RESTORE_DONE" == 1 ]]; then
    return
  fi
  RESTORE_DONE=1
  for f in .env .env.local .env.development .env.development.local .env.production.local; do
    if [[ ! -f "$STASH/$f" ]]; then
      continue
    fi
    if [[ -e "$ROOT/$f" ]]; then
      echo "kept build-time $f; original left at $STASH/$f (not overwritten)"
    else
      mv "$STASH/$f" "$ROOT/$f"
      echo "restored $f"
    fi
  done
}
trap restore_dotenv EXIT INT TERM HUP

for f in .env .env.local .env.development .env.development.local .env.production.local; do
  if [[ -f "$ROOT/$f" ]]; then
    mv "$ROOT/$f" "$STASH/$f"
    echo "stashed local $f so Expo cannot reopen public flags"
  fi
done

GIT_SHA="$(git -C "$REPO" rev-parse HEAD)"
GIT_DIRTY="no"
DIRTY_COUNT="$(git -C "$REPO" status --porcelain | wc -l | tr -d ' ')"
if [[ "$DIRTY_COUNT" != "0" ]]; then
  GIT_DIRTY="yes"
fi

OUT="${LAMPY_ARCHIVE_OUT:-/tmp/lampy-testflight-beta-1}"
mkdir -p "$OUT"
REPORT="$OUT/archive-report.txt"

{
  echo "git_sha=$GIT_SHA"
  echo "git_dirty=$GIT_DIRTY"
  echo "git_dirty_count=$DIRTY_COUNT"
  echo "xcode=$(xcodebuild -version | tr '\n' ' ')"
  echo "bundle=app.lampy.ios"
  echo "team=B283NY984J"
  echo "version=$(node -p "require('./app.json').expo.version")"
  echo "build=$(node -p "require('./app.json').expo.ios.buildNumber")"
  echo "EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS=${EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS-}"
  echo "EXPO_PUBLIC_FAMILY_ENTRY_OPEN=${EXPO_PUBLIC_FAMILY_ENTRY_OPEN-}"
  echo "EXPO_PUBLIC_FAMILY_API_BASE_URL=${EXPO_PUBLIC_FAMILY_API_BASE_URL-}"
  echo "EXPO_PUBLIC_FAMILY_TEST_DRIVER=${EXPO_PUBLIC_FAMILY_TEST_DRIVER-}"
  echo "NODE_ENV=${NODE_ENV-}"
} | tee "$REPORT"

if [[ -d "$ROOT/ios" && "${LAMPY_ALLOW_PREBUILD_CLEAN:-}" != "1" ]]; then
  echo "error: gitignored ios/ exists. prebuild --clean would replace local native edits." | tee -a "$REPORT"
  echo "move ios/ aside, or set LAMPY_ALLOW_PREBUILD_CLEAN=1 (script copies ios/ to $OUT/ios-before-clean first)." | tee -a "$REPORT"
  exit 2
fi

IOS_BACKUP=""
if [[ -d "$ROOT/ios" ]]; then
  IOS_BACKUP="$OUT/ios-before-clean"
  rm -rf "$IOS_BACKUP"
  cp -R "$ROOT/ios" "$IOS_BACKUP"
  echo "backed_up_ios=$IOS_BACKUP" | tee -a "$REPORT"
fi

set +e
npx expo prebuild --platform ios --clean --no-install
PREBUILD_STATUS=$?
set -e
if [[ "$PREBUILD_STATUS" -ne 0 ]]; then
  echo "prebuild_exit=$PREBUILD_STATUS" | tee -a "$REPORT"
  if [[ -n "$IOS_BACKUP" && -d "$IOS_BACKUP" ]]; then
    rm -rf "$ROOT/ios"
    mv "$IOS_BACKUP" "$ROOT/ios"
    echo "restored ios/ from backup after prebuild failure" | tee -a "$REPORT"
  fi
  exit "$PREBUILD_STATUS"
fi

pod install --project-directory=ios

PLIST="$ROOT/ios/Lampy/Info.plist"
ENT="$ROOT/ios/Lampy/Lampy.entitlements"
PRIV="$ROOT/ios/Lampy/PrivacyInfo.xcprivacy"
PBX="$ROOT/ios/Lampy.xcodeproj/project.pbxproj"

{
  echo "--- generated project ---"
  /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c 'Print :MinimumOSVersion' "$PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c 'Print :NSCameraUsageDescription' "$PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c 'Print :NSMicrophoneUsageDescription' "$PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c 'Print :NSPhotoLibraryUsageDescription' "$PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c 'Print :NSFaceIDUsageDescription' "$PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c 'Print :ITSAppUsesNonExemptEncryption' "$PLIST" 2>/dev/null || echo "ITSAppUsesNonExemptEncryption=(unset)"
  echo "DEVELOPMENT_TEAM=$(grep -m1 DEVELOPMENT_TEAM "$PBX" | sed 's/.*= \(.*\);/\1/' | tr -d ' ')"
  echo "IPHONEOS_DEPLOYMENT_TARGET=$(grep -m1 IPHONEOS_DEPLOYMENT_TARGET "$PBX" | sed 's/.*= \(.*\);/\1/' | tr -d ' ')"
  echo "TARGETED_DEVICE_FAMILY=$(grep -m1 TARGETED_DEVICE_FAMILY "$PBX" | head -1)"
  if [[ -f "$ENT" ]]; then
    echo "--- entitlements ---"
    cat "$ENT"
  fi
  if [[ -f "$PRIV" ]]; then
    echo "--- generated PrivacyInfo.xcprivacy (app target only) ---"
    cat "$PRIV"
  else
    echo "PrivacyInfo.xcprivacy=(missing after prebuild)"
  fi
} | tee -a "$REPORT"

echo "archiving Release (no upload)"
set +e
xcodebuild \
  -workspace "$ROOT/ios/Lampy.xcworkspace" \
  -scheme Lampy \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$OUT/Lampy.xcarchive" \
  DEVELOPMENT_TEAM=B283NY984J \
  PRODUCT_BUNDLE_IDENTIFIER=app.lampy.ios \
  archive | tee "$OUT/xcodebuild.log"
ARCHIVE_STATUS=${PIPESTATUS[0]}
set -e

echo "archive_exit=$ARCHIVE_STATUS" | tee -a "$REPORT"
if [[ "$ARCHIVE_STATUS" -ne 0 ]]; then
  echo "archive_failed" | tee -a "$REPORT"
  exit "$ARCHIVE_STATUS"
fi

if [[ ! -d "$OUT/Lampy.xcarchive" ]]; then
  echo "archive_path_missing" | tee -a "$REPORT"
  exit 1
fi

echo "archive_path=$OUT/Lampy.xcarchive" | tee -a "$REPORT"
echo "--- archive inspect ---" | tee -a "$REPORT"
set +e
node "$ROOT/scripts/inspect-release-archive.cjs" "$OUT/Lampy.xcarchive" | tee -a "$REPORT"
INSPECT_STATUS=${PIPESTATUS[0]}
set -e
echo "inspect_exit=$INSPECT_STATUS" | tee -a "$REPORT"
echo "jsbundle_present is not runtime_metro_independent; install the TestFlight build to verify." | tee -a "$REPORT"
exit "$INSPECT_STATUS"
