#!/usr/bin/env bash
# Prepare a local Release Archive for TestFlight. Does not upload or submit.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=./release-public-env.sh
source "$ROOT/scripts/release-public-env.sh"

STASH="$(mktemp -d /tmp/lampy-dotenv-stash.XXXXXX)"
restore_dotenv() {
  for f in .env .env.local .env.development .env.development.local .env.production.local; do
    if [[ -f "$STASH/$f" ]]; then
      mv "$STASH/$f" "$ROOT/$f"
    fi
  done
}
trap restore_dotenv EXIT

for f in .env .env.local .env.development .env.development.local .env.production.local; do
  if [[ -f "$ROOT/$f" ]]; then
    mv "$ROOT/$f" "$STASH/$f"
    echo "stashed local $f so Expo cannot reopen public flags"
  fi
done

GIT_SHA="$(git -C "$ROOT/../.." rev-parse HEAD)"
OUT="${LAMPY_ARCHIVE_OUT:-/tmp/lampy-testflight-beta-1}"
mkdir -p "$OUT"
REPORT="$OUT/archive-report.txt"

{
  echo "git_sha=$GIT_SHA"
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

npx expo prebuild --platform ios --clean --no-install
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
    echo "--- PrivacyInfo.xcprivacy ---"
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
if [[ "$ARCHIVE_STATUS" -eq 0 && -d "$OUT/Lampy.xcarchive" ]]; then
  echo "archive_path=$OUT/Lampy.xcarchive" | tee -a "$REPORT"
  APP="$OUT/Lampy.xcarchive/Products/Applications/Lampy.app"
  if [[ -d "$APP" ]]; then
    echo "embedded_js=$(find "$APP" -name '*.jsbundle' -o -name 'main.jsbundle' | head -5)" | tee -a "$REPORT"
    if find "$APP" -name '*.jsbundle' | grep -q .; then
      echo "metro_independent=yes (embedded jsbundle present)" | tee -a "$REPORT"
    else
      echo "metro_independent=UNKNOWN (no jsbundle found; inspect archive)" | tee -a "$REPORT"
    fi
  fi
fi
exit "$ARCHIVE_STATUS"
