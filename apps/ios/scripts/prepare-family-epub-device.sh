#!/usr/bin/env bash
# Local iPhone acceptance only; never use this profile for a store archive.
set -euo pipefail
mode="${1:-preview}"
case "$mode" in preview|sandbox) ;; *) echo 'Usage: bash scripts/prepare-family-epub-device.sh [preview|sandbox]' >&2; exit 1;; esac
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'Run this script on your Mac with Xcode and CocoaPods installed.' >&2; exit 1
fi
product="${LAMPY_FAMILY_EPUB_PRODUCT_ID:-}"
if [[ "$mode" == sandbox && ( -z "$product" || "$product" == app.lampy.export.designtest ) ]]; then
  echo 'Set LAMPY_FAMILY_EPUB_PRODUCT_ID to the App Store Connect product configured on the family server; local StoreKit products cannot unlock family export.' >&2; exit 1
fi
cd "$(dirname "$0")/.."
unset NODE_ENV BABEL_ENV
npm ci
source scripts/release-public-env.sh
source scripts/family-internal-env.sh
# This local device run is not the closed TestFlight archive profile.
unset LAMPY_BUILD_PROFILE LAMPY_BUILD_NUMBER LAMPY_RELEASE_PRODUCT_ID
export EXPO_PUBLIC_EMAIL_CODE_LOGIN_ENABLED=1
export EXPO_PUBLIC_ACCOUNT_API_BASE_URL="$EXPO_PUBLIC_FAMILY_API_BASE_URL"
export EXPO_PUBLIC_ALBUM_EXPORT_ENABLED=1
export EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED=1
export EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID=app.lampy.export.designtest
if [[ "$mode" == sandbox ]]; then
  export EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID="$product"
  export EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED=1
  export EXPO_PUBLIC_UNIFIED_PURCHASES=1
fi
npx expo prebuild --platform ios --no-install
EXPO_USE_PRECOMPILED_MODULES=0 pod install --project-directory=ios --clean-install
bash scripts/write-family-xcode-env.sh ios/.xcode.env.local
open ios/Lampy.xcworkspace
if [[ "$mode" == sandbox ]]; then
  echo 'In Xcode: iPhone, Release Run configuration, StoreKit Configuration = None. Use Apple Sandbox and the matching enabled family server.'
else
  echo 'In Xcode: iPhone, Release Run configuration. Family and personal free full-screen previews are enabled; family paid export stays closed.'
fi
echo 'Install over the existing app. Do not uninstall Lampy or erase its records.'
