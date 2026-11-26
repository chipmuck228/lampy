#!/usr/bin/env bash
# Local iPhone design acceptance. This is not an archive or production profile.
set -euo pipefail
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'Run this script on your Mac with Xcode and CocoaPods installed.' >&2
  exit 1
fi
cd "$(dirname "$0")/.."
unset NODE_ENV BABEL_ENV
npm ci
source scripts/release-public-env.sh
export EXPO_NO_DOTENV=1
export EXPO_PUBLIC_EMAIL_CODE_LOGIN_ENABLED=1
export EXPO_PUBLIC_ACCOUNT_API_BASE_URL=https://lampy-family-api.5sparks.ai
export EXPO_PUBLIC_ALBUM_EXPORT_ENABLED=1
export EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED=1
export EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID=app.lampy.export.designtest
npx expo prebuild --platform ios --no-install
EXPO_USE_PRECOMPILED_MODULES=0 pod install --project-directory=ios --clean-install
bash scripts/write-family-xcode-env.sh ios/.xcode.env.local
open ios/Lampy.xcworkspace
echo 'In Xcode: select your iPhone, Release Run configuration and local StoreKit design-test configuration.'
echo 'Install over the existing Lampy app; test free full-screen preview first, then paid EPUB save/share.'
