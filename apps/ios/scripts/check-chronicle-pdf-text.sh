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
/^private func (compactPdfText|compactChroniclePdfText|printSegmentsMatch|printPageTextChecksMatch|chronicleSpatialText|chroniclePdfGlyphs|chronicleAnchoredTextBlocks|chroniclePdfTextBlocks|printChronicleTextCheck)\(/ { copying=1 }
/^private struct (ChronicleTextGlyph|ChronicleTextCheck) \{/ { copying=1 }
copying { print }
copying && /^}$/ { copying=0 }
' modules/lampy-album-layout/ios/AlbumPrint.swift >> "$check_file"
cat >> "$check_file" <<'SWIFT'
private func verify(_ label: String, _ expected: Bool, _ checks: [[String]], _ pdf: String) {
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
private let mixed = "小猫和panda，各自休息"
private let letters = Array(mixed).map(String.init)
private let glyphs = letters.enumerated().map { i, value in
  ChronicleTextGlyph(text: value, rect: CGRect(x: CGFloat(40 + i * 25), y: 400, width: 24, height: 30), ordinal: i)
}
private let stream = [3,4,5,6,7,0,1,2,8,9,10,11,12].map { glyphs[$0] }
private func spatial(_ label: String, _ expected: Bool, _ source: [ChronicleTextGlyph]) {
  precondition(printPageTextChecksMatch([[mixed]], in: chronicleSpatialText(source)) == expected, label)
}
spatial("CJK/Latin streams reconstructed by position", true, stream)
spatial("missing glyph still rejected", false, Array(stream.dropLast()))
private let wrong = glyphs.enumerated().map { i, g in ChronicleTextGlyph(text: g.text, rect: CGRect(x: CGFloat(i == 0 ? 65 : i == 1 ? 40 : Int(g.rect.minX)), y: 400, width: 24, height: 30), ordinal: i) }
spatial("same characters in wrong visible order rejected", false, wrong)
private let wrapped = glyphs.enumerated().map { i, g in ChronicleTextGlyph(text: g.text, rect: CGRect(x: CGFloat(40 + (i % 9) * 25), y: CGFloat(i < 9 ? 400 : 340), width: 24, height: 30), ordinal: i) }
spatial("two horizontal lines", true, Array(wrapped.reversed()))
private let punctuation = glyphs.enumerated().map { i, g in i == 8 ? ChronicleTextGlyph(text:g.text,rect:CGRect(x:g.rect.minX,y:401,width:12,height:4),ordinal:i) : g }
spatial("short punctuation stays on the same line", true, punctuation)
private let substituted = glyphs.enumerated().map { i, g in ChronicleTextGlyph(text:i == 12 ? "跑" : g.text,rect:g.rect,ordinal:i) }
spatial("same-length replacement rejected", false, substituted)
// Replay the measured malformed boundaries from the synthetic Mac PDF.
private let capturedText = Array("panda 小猫和 ，各自休息").map(String.init)
private let capturedRects: [CGRect] = [
  CGRect(x:124.84,y:226.164,width:14.07,height:17.696),
  CGRect(x:138.91,y:231.372,width:14.196,height:11.34),
  CGRect(x:153.106,y:231.596,width:15.022,height:11.76),
  CGRect(x:168.128,y:231.092,width:14.532,height:19.068),
  CGRect(x:182.66,y:231.372,width:-62.622,height:11.34),
  CGRect(x:271.938,y:231.372,width:-341.775,height:11.34),
  CGRect(x:158.013,y:226.864,width:-137.6655,height:21.896),
  CGRect(x:113.6365,y:227.284,width:-28.23275,height:22.568),
  CGRect(x:105.95225,y:226.22,width:16.81575,height:22.876),
  CGRect(x:122.768,y:226.22,width:78.848,height:22.876),
  CGRect(x:201.616,y:224.82,width:14.812,height:8.064),
  CGRect(x:216.428,y:226.976,width:39.942,height:23.576),
  CGRect(x:256.37,y:226.22,width:21.406,height:24.724),
  CGRect(x:277.776,y:226.164,width:32.536,height:24.052),
  CGRect(x:310.312,y:226.976,width:23.996,height:24.248)
]
private let captured = capturedText.enumerated().map { i,t in ChronicleTextGlyph(text:t,rect:capturedRects[i],ordinal:i) }
private let blocks = chronicleAnchoredTextBlocks(captured,region:nil)!
precondition(printPageTextChecksMatch([[mixed]],in:chronicleSpatialText(blocks)),"captured PDF block order")
private let capturedReplacement = captured.enumerated().map { i,g in ChronicleTextGlyph(text:i == 14 ? "跑" : g.text,rect:g.rect,ordinal:g.ordinal) }
precondition(!printPageTextChecksMatch([[mixed]],in:chronicleSpatialText(chronicleAnchoredTextBlocks(capturedReplacement,region:nil)!)),"captured replacement rejected")
precondition(!printPageTextChecksMatch([[mixed]],in:chronicleSpatialText(chronicleAnchoredTextBlocks(Array(captured.dropLast()),region:nil)!)),"captured missing glyph rejected")
private let unanchored = captured.map { ChronicleTextGlyph(text:$0.text,rect:.null,ordinal:$0.ordinal) }
precondition(chronicleAnchoredTextBlocks(unanchored,region:nil) == nil,"unanchored blocks rejected")
// Real PDFKit adapter checks, using CoreText to paint font runs out of stream order.
private func fixturePdf(_ last: String) -> PDFDocument {
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
print("CHRONICLE_PDF_TEXT_UNIT_OK: 25 normalization/spatial cases")
// Diagnostic input below is synthetic fixture content, never an Album or file.
private func diagnoseSyntheticPdf(_ page: PDFPage) {
  let raw = page.string ?? ""
  let ns = raw as NSString
  print("SYNTHETIC_PDF raw=\(String(reflecting: raw)) utf16=\(ns.length) characters=\(page.numberOfCharacters)")
  print("SYNTHETIC_PDF expected=\(String(reflecting: mixed))")
  print("SYNTHETIC_PDF scalars=" + raw.unicodeScalars.map { String(format:"U+%04X",$0.value) }.joined(separator:" "))
  for index in 0..<min(page.numberOfCharacters, 32) {
    let char = index < ns.length ? ns.substring(with:NSRange(location:index,length:1)) : "<outside-string>"
    print("SYNTHETIC_GLYPH index=\(index) text=\(String(reflecting:char)) rect=\(page.characterBounds(at:index))")
  }
  if let all = chroniclePdfGlyphs(page,viewportRect:nil) {
    print("SYNTHETIC_PDF reconstructed=\(String(reflecting:chronicleSpatialText(all))) glyphs=\(all.count)")
  } else { print("SYNTHETIC_PDF reconstruction=unavailable") }
  if let blocks = chroniclePdfTextBlocks(page,viewportRect:nil) {
    print("SYNTHETIC_PDF blocks=\(String(reflecting:chronicleSpatialText(blocks))) count=\(blocks.count)")
  } else { print("SYNTHETIC_PDF blocks=unavailable") }
  if let region = chroniclePdfGlyphs(page,viewportRect:CGRect(x:0,y:0,width:1200,height:900)) {
    print("SYNTHETIC_PDF scoped=\(String(reflecting:chronicleSpatialText(region))) glyphs=\(region.count)")
  } else { print("SYNTHETIC_PDF scoped=unavailable") }
}
private func verifyPdf(_ name:String,_ expected:Bool,_ page:PDFPage) -> Bool {
  let check = ChronicleTextCheck(parts:[mixed],viewportRect:CGRect(x:0,y:0,width:1200,height:900))
  let result = printChronicleTextCheck(check,in:page)
  print("PDFKIT_CASE \(name) expected=\(expected) actual=\(result)")
  if result != expected { diagnoseSyntheticPdf(page) }
  return result == expected
}
private let correct = fixturePdf("，各自休息")
private let missing = fixturePdf("，各自休")
private let replacement = fixturePdf("，各自休跑")
private let results = [verifyPdf("mixed-text",true,correct.page(at:0)!),
                       verifyPdf("missing-glyph",false,missing.page(at:0)!),
                       verifyPdf("replaced-glyph",false,replacement.page(at:0)!)]
if !results.allSatisfy({ $0 }) {
  print("CHRONICLE_PDF_TEXT_CHECKS_FAILED: \(results.filter { !$0 }.count) PDFKit cases; report SYNTHETIC_/PDFKIT_CASE lines before another device build")
  exit(1)
}
print("CHRONICLE_PDF_TEXT_CHECKS_OK: 28 production Swift/PDFKit cases")
SWIFT
if [[ "${1:-}" == "--webkit" ]]; then
  cat >> "$check_file" <<'WEBKIT_SWIFT'
import AppKit
import WebKit

// This probe uses inline text only. It reads no Album, images or credentials.
private final class ChronicleWebKitProbe: NSObject, WKNavigationDelegate {
  private let text = ProcessInfo.processInfo.environment["LAMPY_PDF_PROBE_TEXT"] ?? "小猫和panda，各自休息"
  private let cases: [(String, String)] = [
    ("current", ""),
    ("kaiti-first", ".chronicle-pair-copy{font-family:'Kaiti SC',STKaiti,KaiTi,'Songti SC',Georgia,serif}"),
    ("songti-first", ".chronicle-pair-copy{font-family:'Songti SC',STSong,Georgia,serif}")
  ]
  private var cursor = 0
  private var currentPassed = false
  private var view: WKWebView?
  private var timeout: DispatchWorkItem?
  private var css = ""
  func start() {
    do {
      let source = try String(contentsOfFile:"src/application/album-chronicle-pair.ts",encoding:.utf8)
      let parts = source.components(separatedBy:"export const CHRONICLE_PAIR_CSS=`")
      guard parts.count == 2, let block = parts[1].components(separatedBy:"`;").first else { fail("CSS_SOURCE",nil); return }
      css = block.replacingOccurrences(of:"${CHRONICLE_TEXT_COLOR}",with:"#105f62")
      let config = WKWebViewConfiguration(); config.websiteDataStore = .nonPersistent()
      let web = WKWebView(frame:CGRect(x:0,y:0,width:1200,height:900),configuration:config)
      web.navigationDelegate = self; view = web
      print("WEBKIT_PROBE input=\(String(reflecting:text)) uses=inline-text-only")
      load()
    } catch { fail("CSS_READ",error) }
  }
  private func escaped(_ value:String) -> String {
    value.replacingOccurrences(of:"&",with:"&amp;").replacingOccurrences(of:"<",with:"&lt;").replacingOccurrences(of:">",with:"&gt;")
  }
  private func load() {
    if cursor == cases.count {
      print("CHRONICLE_WEBKIT_PROBE_COMPLETE current=\(currentPassed ? "PASS" : "FAIL")")
      view?.navigationDelegate = nil; view?.stopLoading(); timeout?.cancel()
      exit(currentPassed ? 0 : 1)
    }
    timeout?.cancel()
    let deadline = DispatchWorkItem { [weak self] in self?.fail("TIMEOUT",nil) }
    timeout = deadline; DispatchQueue.main.asyncAfter(deadline:.now()+30,execute:deadline)
    let html = """
    <!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=1200,height=900"><style>
    *{box-sizing:border-box}html,body{margin:0;padding:0;width:1200px;height:900px}.fixed-page{position:relative;width:1200px;height:900px}
    .fixed-prose{font-size:28px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;width:100%}
    \(css)
    \(cases[cursor].1)
    </style></head><body><main class="fixed-page"><section class="chronicle-pair-page" lang="en"><div class="chronicle-pair-copy" style="left:800px;top:252px;width:320px;height:396px"><div class="fixed-prose">\(escaped(text))</div></div></section></main></body></html>
    """
    view?.loadHTMLString(html,baseURL:nil)
  }
  func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!) {
    webView.callAsyncJavaScript("await document.fonts.ready;return true;",arguments:[:],in:nil,in:.page) { [weak self] ready in
      guard let self = self else { return }
      switch ready {
      case .failure(let error): self.fail("FONTS",error)
      case .success:
        let config = WKPDFConfiguration(); config.rect = CGRect(x:0,y:0,width:1200,height:900)
        webView.createPDF(configuration:config) { [weak self] result in
          guard let self = self else { return }
          do { try self.inspect(try result.get()); self.cursor += 1; self.load() }
          catch { self.fail("CREATE_PDF",error) }
        }
      }
    }
  }
  private func inspect(_ data:Data) throws {
    guard let document = PDFDocument(data:data), document.pageCount == 1, let page = document.page(at:0) else {
      throw NSError(domain:"LampyProbe",code:1)
    }
    let raw = page.string ?? ""
    let expected = compactChroniclePdfText(text), actual = compactChroniclePdfText(raw)
    let check = ChronicleTextCheck(parts:[text],viewportRect:CGRect(x:800,y:252,width:320,height:396))
    let passed = printChronicleTextCheck(check,in:page)
    if cursor == 0 { currentPassed = passed }
    print("WEBKIT_CASE \(cases[cursor].0) exact=\(expected == actual) accepted=\(passed) expected=\(expected.unicodeScalars.count) extracted=\(actual.unicodeScalars.count)")
    print("WEBKIT_RAW \(String(reflecting:raw))")
    print("WEBKIT_DIFF missing=\(delta(expected,actual)) extra=\(delta(actual,expected))")
    var names = Set<String>()
    if let attributed = page.attributedString {
      attributed.enumerateAttribute(NSAttributedString.Key("NSFont"),in:NSRange(location:0,length:attributed.length),options:[]) { value,_,_ in
        if let font = value as? NSFont { names.insert(font.fontName) }
      }
    }
    print("WEBKIT_FONTS \(names.sorted().joined(separator:","))")
  }
  private func delta(_ from:String,_ to:String) -> String {
    var counts: [UInt32:Int] = [:]
    for scalar in from.unicodeScalars { counts[scalar.value,default:0] += 1 }
    for scalar in to.unicodeScalars { counts[scalar.value,default:0] -= 1 }
    return counts.keys.sorted().filter { counts[$0,default:0] > 0 }.map { String(format:"U+%04X",$0)+"x\(counts[$0]!)" }.joined(separator:",")
  }
  func webView(_ webView:WKWebView,didFail navigation:WKNavigation!,withError error:Error) { fail("LOAD",error) }
  func webView(_ webView:WKWebView,didFailProvisionalNavigation navigation:WKNavigation!,withError error:Error) { fail("LOAD",error) }
  func webViewWebContentProcessDidTerminate(_ webView:WKWebView) { fail("PROCESS",nil) }
  private func fail(_ stage:String,_ error:Error?) {
    print("WEBKIT_PROBE_ERROR stage=\(stage) code=\((error as NSError?)?.code ?? 0)")
    exit(2)
  }
}
private let application = NSApplication.shared
application.setActivationPolicy(.prohibited)
private let webkitProbe = ChronicleWebKitProbe()
DispatchQueue.main.async { webkitProbe.start() }
application.run()
WEBKIT_SWIFT
fi
swift "$check_file"
