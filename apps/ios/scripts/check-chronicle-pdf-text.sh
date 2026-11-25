#!/usr/bin/env bash
# Runs production text matching and PDF glyph reconstruction on macOS, without UIKit or a simulator.
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
printf 'import Foundation\nimport CoreGraphics\nimport CoreText\nimport PDFKit\n' > "$check_file"
awk '
/^private func (compactPdfText|compactChroniclePdfText|printSegmentsMatch|printPageTextChecksMatch|chronicleSpatialText|chroniclePdfGlyphs|printChronicleTextCheck)\(/ { copying=1 }
/^private struct (ChronicleTextGlyph|ChronicleTextCheck) \{/ { copying=1 }
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
verify("presentation ligatures", true, [["office"]], "oﬃce")
verify("fi and fl ligatures", true, [["find flowers"]], "ﬁnd ﬂowers")
verify("soft hyphen at wrapping", true, [["ordinary"]], "ordi\u{00AD}nary")
verify("zero-width break", true, [["记忆"]], "记\u{200B}忆")
verify("real hyphen is still required", false, [["mother-in-law"]], "motherinlaw")
verify("missing letter is still rejected", false, [["ordinary"]], "ordinry")
// Synthetic 13-character CJK/Latin fixture; no user's album writing is embedded.
let mixed = "小猫和panda，各自休息"
let letters = Array(mixed).map(String.init)
let glyphs = letters.enumerated().map { i, value in
  ChronicleTextGlyph(text: value, rect: CGRect(x: CGFloat(40 + i * 25), y: 400, width: 24, height: 30), ordinal: i)
}
let stream = [3,4,5,6,7,0,1,2,8,9,10,11,12].map { glyphs[$0] }
func spatial(_ label: String, _ expected: Bool, _ source: [ChronicleTextGlyph]) {
  precondition(printPageTextChecksMatch([[mixed]], in: chronicleSpatialText(source)) == expected, label)
}
spatial("CJK/Latin streams reconstructed by position", true, stream)
spatial("missing glyph still rejected", false, Array(stream.dropLast()))
let wrong = glyphs.enumerated().map { i, g in ChronicleTextGlyph(text: g.text, rect: CGRect(x: CGFloat(i == 0 ? 65 : i == 1 ? 40 : Int(g.rect.minX)), y: 400, width: 24, height: 30), ordinal: i) }
spatial("same characters in wrong visible order rejected", false, wrong)
let wrapped = glyphs.enumerated().map { i, g in ChronicleTextGlyph(text: g.text, rect: CGRect(x: CGFloat(40 + (i % 9) * 25), y: CGFloat(i < 9 ? 400 : 340), width: 24, height: 30), ordinal: i) }
spatial("two horizontal lines", true, Array(wrapped.reversed()))
let punctuation = glyphs.enumerated().map { i, g in i == 8 ? ChronicleTextGlyph(text:g.text,rect:CGRect(x:g.rect.minX,y:401,width:12,height:4),ordinal:i) : g }
spatial("short punctuation stays on the same line", true, punctuation)
let substituted = glyphs.enumerated().map { i, g in ChronicleTextGlyph(text:i == 12 ? "跑" : g.text,rect:g.rect,ordinal:i) }
spatial("same-length replacement rejected", false, substituted)
// Real PDFKit adapter checks, using CoreText to paint font runs out of stream order.
func fixturePdf(_ last: String) -> PDFDocument {
  let data = NSMutableData()
  let consumer = CGDataConsumer(data: data as CFMutableData)!
  var bounds = CGRect(x:0,y:0,width:600,height:450)
  let context = CGContext(consumer:consumer,mediaBox:&bounds,nil)!
  context.beginPDFPage(nil)
  let font = CTFontCreateWithName("Kaiti SC" as CFString, 28, nil)
  let chunks = ["小猫和", "panda", last].map { CTLineCreateWithAttributedString(NSAttributedString(string:$0,attributes:[NSAttributedString.Key(kCTFontAttributeName as String):font])) }
  let widths = chunks.map { CGFloat(CTLineGetTypographicBounds($0,nil,nil,nil)) }
  let positions: [CGFloat] = [40, 40 + widths[0], 40 + widths[0] + widths[1]]
  for i in [1,0,2] { context.textPosition = CGPoint(x:positions[i],y:230); CTLineDraw(chunks[i],context) }
  context.endPDFPage(); context.closePDF()
  return PDFDocument(data:data as Data)!
}
let correct = fixturePdf("，各自休息")
let full = ChronicleTextCheck(parts:[mixed],viewportRect:CGRect(x:0,y:0,width:1200,height:900))
precondition(printChronicleTextCheck(full,in:correct.page(at:0)!),"real PDF mixed text")
let missing = fixturePdf("，各自休")
precondition(!printChronicleTextCheck(full,in:missing.page(at:0)!),"real PDF missing glyph")
let replacement = fixturePdf("，各自休跑")
precondition(!printChronicleTextCheck(full,in:replacement.page(at:0)!),"real PDF replaced glyph")
print("CHRONICLE_PDF_TEXT_CHECKS_OK: 24 production Swift/PDFKit cases")
SWIFT
swift "$check_file"
