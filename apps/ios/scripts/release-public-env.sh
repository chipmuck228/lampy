# Source from apps/ios before a Release archive. Not for Metro / Dev Client.
# Overrides leftover shell flags. scripts/release-archive.sh also stashes local dotenv.

unset EXPO_PUBLIC_FAMILY_ENTRY_OPEN
unset EXPO_PUBLIC_FAMILY_API_BASE_URL
unset EXPO_PUBLIC_FAMILY_TEST_DRIVER
unset EXPO_PUBLIC_FAMILY_TEST_INVITE_CODE

export EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS=0
export EXPO_PUBLIC_FAMILY_ENTRY_OPEN=
export EXPO_PUBLIC_FAMILY_API_BASE_URL=
export EXPO_PUBLIC_FAMILY_TEST_DRIVER=
export EXPO_PUBLIC_FAMILY_TEST_INVITE_CODE=

export NODE_ENV=production
export BABEL_ENV=production
