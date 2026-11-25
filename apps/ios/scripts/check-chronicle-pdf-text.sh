#!/usr/bin/env bash
# Runs the production Swift text-matching functions without UIKit or a simulator.
# On a Mac: bash apps/ios/scripts/check-chronicle-pdf-text.sh
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v swift >/dev/null; then
  echo 'Swift is required; run this check on the Mac used for Xcode builds.' >&2
  exit 2
fi
check_dir="$(mktemp -d "${TMPDIR:-/tmp}/lampy-pdf-text.XXXXXX")"
check_file="$check_dir/check.swift"
trap 'rm -f "$check_file"; rmdir "$check_dir"' EXIT
printf 'import Foundation\n' > "$check_file"
awk '
/^private func (compactPdfText|printSegmentsMatch|printPageTextChecksMatch)\(/ { copying=1 }
copying { print }
copying && /^}$/ { copying=0 }
' modules/lampy-album-layout/ios/AlbumPrint.swift >> "$check_file"
cat >> "$check_file" <<'SWIFT'
func verify(_ label: String, _ expected: Bool, _ checks: [[String]], _ pdf: String) {
  precondition(printPageTextChecksMatch(checks, in: compactPdfText(pdf)) == expected, label)
}
// Same cover title is observed by both the DOM inspection and source metadata.
verify("cover title occurs once", true, [["LAMPY"], ["Ourdays"], ["Ourdays"]], "LAMPY Our days")
// PDF spatial extraction can return independently positioned text in a different order.
verify("spatial extraction order", true, [["2026"], ["JULY"], ["31"]], "31 JULY 2026")
verify("source and DOM note overlap", true, [["今天"], ["真好"], ["今天真好"]], "今天真好")
verify("missing title rejected", false, [["Ourdays"]], "LAMPY Other days")
verify("missing writing rejected", false, [["今天"], ["真好"], ["今天真好"]], "今天")
verify("emoji excluded ranges retain order", true, [["Before", "after"]], "Before after")
verify("segments within a single source remain ordered", false, [["Before", "after"]], "after Before")
verify("repeated writing in one source needs both occurrences", false, [["今天今天"]], "今天")
verify("complete repeated writing", true, [["今天今天"]], "今天今天")
print("CHRONICLE_PDF_TEXT_CHECKS_OK: 9 production Swift cases")
SWIFT
swift "$check_file"
