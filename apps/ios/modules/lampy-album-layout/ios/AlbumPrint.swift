import CryptoKit
import CoreGraphics
import CoreText
import PDFKit
import UIKit
import WebKit

private func printFailure(_ reason: String) -> NSError {
  NSError(domain: "LampyAlbumPrint", code: 1, userInfo: [NSLocalizedDescriptionKey: reason])
}
func printLocalURL(_ raw: String) throws -> URL {
  let url: URL
  if raw.hasPrefix("file://") {
    guard let parsed = URL(string: raw), parsed.isFileURL else { throw printFailure("LOCAL_FILE_REQUIRED") }
    url = parsed
  } else {
    guard raw.hasPrefix("/") else { throw printFailure("LOCAL_FILE_REQUIRED") }
    url = URL(fileURLWithPath: raw)
  }
  return url.standardizedFileURL
}
func printFileDigest(_ raw: String) throws -> [String: Any] {
  let url = try printLocalURL(raw)
  let handle = try FileHandle(forReadingFrom: url)
  defer { try? handle.close() }
  var hash = SHA256()
  var bytes = 0
  while true {
    let data = try handle.read(upToCount: 64 * 1024) ?? Data()
    if data.isEmpty { break }
    bytes += data.count
    hash.update(data: data)
  }
  return ["sha256": hash.finalize().map { String(format: "%02x", $0) }.joined(), "bytes": bytes]
}
func copyPrintMedia(_ source: String, _ destination: String) throws -> [String: Any] {
  let before = try printFileDigest(source)
  let target = try printLocalURL(destination)
  try FileManager.default.copyItem(at: printLocalURL(source), to: target)
  do {
    let copied = try printFileDigest(destination)
    let after = try printFileDigest(source)
    guard before["sha256"] as? String == copied["sha256"] as? String,
          before["sha256"] as? String == after["sha256"] as? String else { throw printFailure("SOURCE_CHANGED") }
    return copied
  } catch {
    try? FileManager.default.removeItem(at: target)
    throw error
  }
}
private final class FontCollector {
  var fonts: [[String: Any]] = []
  var hasUninspectedForm = false
  var depth = 0
}
private func pdfName(_ dictionary: CGPDFDictionaryRef, _ key: String) -> String {
  var name: UnsafePointer<CChar>?
  guard CGPDFDictionaryGetName(dictionary, key, &name), let name = name else { return "" }
  return String(cString: name)
}
private func fontStream(_ font: CGPDFDictionaryRef) -> String {
  var descriptor: CGPDFDictionaryRef?
  if CGPDFDictionaryGetDictionary(font, "FontDescriptor", &descriptor), let descriptor = descriptor {
    for name in ["FontFile", "FontFile2", "FontFile3"] {
      var stream: CGPDFStreamRef?
      if CGPDFDictionaryGetStream(descriptor, name, &stream), stream != nil { return name }
    }
    return "none"
  }
  var children: CGPDFArrayRef?
  if CGPDFDictionaryGetArray(font, "DescendantFonts", &children), let children = children, CGPDFArrayGetCount(children) > 0 {
    var child: CGPDFDictionaryRef?
    if CGPDFArrayGetDictionary(children, 0, &child), let child = child { return fontStream(child) }
  }
  var glyphs: CGPDFDictionaryRef?
  if pdfName(font, "Subtype") == "Type3", CGPDFDictionaryGetDictionary(font, "CharProcs", &glyphs), glyphs != nil { return "CharProcs" }
  return "unknown"
}
private func collectResourceFonts(_ resources: CGPDFDictionaryRef, _ result: FontCollector) {
  guard result.depth < 12 else { result.hasUninspectedForm = true; return }
  result.depth += 1
  defer { result.depth -= 1 }
  var fonts: CGPDFDictionaryRef?
  if CGPDFDictionaryGetDictionary(resources, "Font", &fonts), let fonts = fonts {
    CGPDFDictionaryApplyFunction(fonts, { _, object, info in
      guard let info = info else { return }
      let result = Unmanaged<FontCollector>.fromOpaque(info).takeUnretainedValue()
      var font: CGPDFDictionaryRef?
      if CGPDFObjectGetValue(object, .dictionary, &font), let font = font {
        result.fonts.append(["baseFont": pdfName(font, "BaseFont"), "subtype": pdfName(font, "Subtype"), "embedStream": fontStream(font)])
      }
    }, Unmanaged.passUnretained(result).toOpaque())
  }
  var objects: CGPDFDictionaryRef?
  if CGPDFDictionaryGetDictionary(resources, "XObject", &objects), let objects = objects {
    CGPDFDictionaryApplyFunction(objects, { _, object, info in
      guard let info = info else { return }
      let result = Unmanaged<FontCollector>.fromOpaque(info).takeUnretainedValue()
      var stream: CGPDFStreamRef?
      if CGPDFObjectGetValue(object, .stream, &stream), let stream = stream,
         let dictionary = CGPDFStreamGetDictionary(stream), pdfName(dictionary, "Subtype") == "Form" {
        var nested: CGPDFDictionaryRef?
        if CGPDFDictionaryGetDictionary(dictionary, "Resources", &nested), let nested = nested { collectResourceFonts(nested, result) }
        else { result.hasUninspectedForm = true }
      }
    }, Unmanaged.passUnretained(result).toOpaque())
  }
}
private func collectPageFonts(_ pdf: CGPDFDocument) -> FontCollector {
  let result = FontCollector()
  for index in 1...pdf.numberOfPages {
    guard let page = pdf.page(at: index), let dictionary = page.dictionary else { continue }
    var resources: CGPDFDictionaryRef?
    if CGPDFDictionaryGetDictionary(dictionary, "Resources", &resources), let resources = resources { collectResourceFonts(resources, result) }
  }
  return result
}
private func compactPdfText(_ value: String) -> String {
  value.precomposedStringWithCanonicalMapping.unicodeScalars.filter { !CharacterSet.whitespacesAndNewlines.contains($0) }.map { String($0) }.joined()
}
// Only ranges actually shaped with Apple's color emoji face are visual-only.
// String ranges from CoreText are UTF-16, unlike layout's Unicode-scalar ranges.
private func printColorGlyphRanges(_ text: String, font: UIFont) throws -> [NSRange] {
  let attributed = NSAttributedString(string: text, attributes: [.font: font])
  let line = CTLineCreateWithAttributedString(attributed)
  let runs = CTLineGetGlyphRuns(line) as? [CTRun] ?? []
  var ranges: [NSRange] = []
  for run in runs {
    let attributes = CTRunGetAttributes(run) as NSDictionary
    guard let value = attributes[kCTFontAttributeName] else { throw printFailure("INVALID_LAYOUT") }
    let name = CTFontCopyPostScriptName(value as! CTFont) as String
    if name == "AppleColorEmoji" {
      let range = CTRunGetStringRange(run)
      guard range.location >= 0, range.length > 0,
            range.location + range.length <= (text as NSString).length,
            CTRunGetGlyphCount(run) > 0 else { throw printFailure("INVALID_LAYOUT") }
      ranges.append(NSRange(location: range.location, length: range.length))
    }
  }
  return ranges.sorted { $0.location < $1.location }
}
private func printRequiredSegments(_ text: String, excluding ranges: [NSRange]) -> [String] {
  let source = text as NSString
  var cursor = 0
  var parts: [String] = []
  for range in ranges {
    if range.location > cursor { parts.append(source.substring(with: NSRange(location: cursor, length: range.location - cursor))) }
    cursor = max(cursor, NSMaxRange(range))
  }
  if cursor < source.length { parts.append(source.substring(from: cursor)) }
  return parts.map { compactPdfText($0) }.filter { !$0.isEmpty }
}
private func printSegmentsMatch(_ parts: [String], in text: String) -> Bool {
  var remainder = text[...]
  for part in parts {
    guard let range = remainder.range(of: part) else { return false }
    remainder = remainder[range.upperBound...]
  }
  return true
}
// Checks describe independent observations of the same page (DOM runs and source
// title/note). Repeated observations must not consume a second text occurrence.
private func compactChroniclePdfText(_ value: String) -> String {
  // PDF font shaping may expose presentation ligatures (e.g. ﬁ) and discretionary
  // line-break marks. Normalize only the comparison; never rewrite the source/PDF.
  value.precomposedStringWithCompatibilityMapping.unicodeScalars.filter {
    !CharacterSet.whitespacesAndNewlines.contains($0) && ![0x00AD, 0x200B, 0x2060, 0xFEFF].contains($0.value)
  }.map { String($0) }.joined()
}
private func printPageTextChecksMatch(_ checks: [[String]], in text: String) -> Bool {
  let actual = compactChroniclePdfText(text)
  return checks.allSatisfy { printSegmentsMatch($0.map(compactChroniclePdfText).filter { !$0.isEmpty }, in: actual) }
}
private struct ChronicleTextGlyph {
  let text: String
  let rect: CGRect
  let ordinal: Int
}
private struct ChronicleTextCheck {
  let parts: [String]
  let viewportRect: CGRect?
}
// Reconstruct horizontal reading order from the PDF's actual glyph positions,
// never from the expected string or an unordered character inventory.
private func chronicleSpatialText(_ glyphs: [ChronicleTextGlyph]) -> String {
  guard !glyphs.isEmpty else { return "" }
  let heights = glyphs.map { $0.rect.height }.sorted()
  let tolerance = max(2, heights[heights.count / 2] * 0.65)
  let ordered = glyphs.sorted { $0.rect.midY == $1.rect.midY ? $0.ordinal < $1.ordinal : $0.rect.midY > $1.rect.midY }
  var rows: [[ChronicleTextGlyph]] = []
  for glyph in ordered {
    let row = rows.indices.min { abs(rows[$0][0].rect.midY - glyph.rect.midY) < abs(rows[$1][0].rect.midY - glyph.rect.midY) }
    if let row = row, abs(rows[row][0].rect.midY - glyph.rect.midY) <= tolerance { rows[row].append(glyph) }
    else { rows.append([glyph]) }
  }
  return rows.map { row in
    row.sorted { $0.rect.minX == $1.rect.minX ? $0.ordinal < $1.ordinal : $0.rect.minX < $1.rect.minX }.map { $0.text }.joined()
  }.joined(separator: "\n")
}
private func chroniclePdfGlyphs(_ page: PDFPage, viewportRect: CGRect?) -> [ChronicleTextGlyph]? {
  let text = (page.string ?? "") as NSString
  // Fail closed if PDFKit's index space cannot be aligned with the string.
  guard page.numberOfCharacters == text.length else { return nil }
  let media = page.bounds(for: .mediaBox)
  let region: CGRect?
  if let box = viewportRect {
    region = CGRect(x: media.minX + box.minX * media.width / 1200,
                    y: media.minY + (900 - box.maxY) * media.height / 900,
                    width: box.width * media.width / 1200, height: box.height * media.height / 900)
      .insetBy(dx: -2 * media.width / 1200, dy: -2 * media.height / 900)
  } else { region = nil }
  var glyphs: [ChronicleTextGlyph] = []
  var index = 0
  while index < text.length {
    let range = text.rangeOfComposedCharacterSequence(at: index)
    let value = text.substring(with: range)
    index = NSMaxRange(range)
    if compactChroniclePdfText(value).isEmpty { continue }
    var rect = CGRect.null
    for offset in range.location..<NSMaxRange(range) {
      let box = page.characterBounds(at: offset)
      if !box.isNull && !box.isInfinite && box.size.width > 0 && box.size.height > 0 { rect = rect.union(box) }
    }
    guard !rect.isNull, !rect.isInfinite, rect.minX.isFinite, rect.minY.isFinite, rect.maxX.isFinite, rect.maxY.isFinite else { return nil }
    if let region = region, !region.contains(CGPoint(x: rect.midX, y: rect.midY)) { continue }
    glyphs.append(ChronicleTextGlyph(text: value, rect: rect, ordinal: range.location))
  }
  return glyphs
}
// Preserve each extracted text block's internal order. PDFKit may manufacture
// negative character advances at boundaries between separately painted runs.
// Such rectangles are not trustworthy anchors, but their text must not be lost.
private func chronicleAnchoredTextBlocks(_ units: [ChronicleTextGlyph], region: CGRect?) -> [ChronicleTextGlyph]? {
  var result: [ChronicleTextGlyph] = []
  var text = ""
  var anchor = CGRect.null
  var ordinal = 0
  func flush() -> Bool {
    if text.isEmpty { return true }
    guard !anchor.isNull else { return false } // Never guess an unanchored block.
    if region?.contains(CGPoint(x: anchor.midX, y: anchor.midY)) ?? true {
      result.append(ChronicleTextGlyph(text: text, rect: anchor, ordinal: ordinal))
    }
    text = ""; anchor = .null
    return true
  }
  for unit in units {
    if unit.text.unicodeScalars.allSatisfy({ CharacterSet.whitespacesAndNewlines.contains($0) }) {
      guard flush() else { return nil }; continue
    }
    if text.isEmpty { ordinal = unit.ordinal }
    text += unit.text
    let box = unit.rect
    // Inspect stored size, not CGRect.width/height (which standardize negatives).
    if !box.isNull && !box.isInfinite && box.size.width > 0 && box.size.height > 0 &&
        box.origin.x.isFinite && box.origin.y.isFinite && box.size.width.isFinite && box.size.height.isFinite {
      anchor = anchor.union(box)
    }
  }
  guard flush() else { return nil }
  return result
}
private func chroniclePdfTextBlocks(_ page: PDFPage, viewportRect: CGRect?) -> [ChronicleTextGlyph]? {
  let text = (page.string ?? "") as NSString
  guard page.numberOfCharacters == text.length else { return nil }
  var units: [ChronicleTextGlyph] = []
  var index = 0
  while index < text.length {
    let range = text.rangeOfComposedCharacterSequence(at: index)
    index = NSMaxRange(range)
    let value = text.substring(with: range)
    var box = CGRect.null
    for offset in range.location..<NSMaxRange(range) {
      let rect = page.characterBounds(at: offset)
      if !rect.isNull && !rect.isInfinite && rect.size.width > 0 && rect.size.height > 0 &&
          rect.origin.x.isFinite && rect.origin.y.isFinite && rect.size.width.isFinite && rect.size.height.isFinite {
        box = box.union(rect)
      }
    }
    units.append(ChronicleTextGlyph(text: value, rect: box, ordinal: range.location))
  }
  let media = page.bounds(for: .mediaBox)
  let region = viewportRect.map { box in
    CGRect(x: media.minX + box.minX * media.width / 1200,
           y: media.minY + (900 - box.maxY) * media.height / 900,
           width: box.width * media.width / 1200, height: box.height * media.height / 900)
      .insetBy(dx: -2 * media.width / 1200, dy: -2 * media.height / 900)
  }
  return chronicleAnchoredTextBlocks(units, region: region)
}

private func printChronicleTextCheck(_ check: ChronicleTextCheck, in page: PDFPage) -> Bool {
  if printPageTextChecksMatch([check.parts], in: page.string ?? "") { return true }
  if let glyphs = chroniclePdfGlyphs(page, viewportRect: check.viewportRect),
     printPageTextChecksMatch([check.parts], in: chronicleSpatialText(glyphs)) { return true }
  guard let blocks = chroniclePdfTextBlocks(page, viewportRect: check.viewportRect) else { return false }
  return printPageTextChecksMatch([check.parts], in: chronicleSpatialText(blocks))
}
private func chronicleViewportRect(_ value: Any?) -> CGRect? {
  guard let box = value as? [String: Any], let x = box["left"] as? Double, let y = box["top"] as? Double,
        let width = box["width"] as? Double, let height = box["height"] as? Double,
        x.isFinite, y.isFinite, width.isFinite, height.isFinite, width > 0, height > 0 else { return nil }
  return CGRect(x: x, y: y, width: width, height: height)
}

func writePrintPdf(_ layoutJson: String, _ mediaJson: String, _ destination: String) throws -> [String: Any] {
  guard let data = layoutJson.data(using: .utf8), let layout = try JSONSerialization.jsonObject(with: data) as? [String: Any],
        let pages = layout["pages"] as? [[String: Any]], !pages.isEmpty,
        let size = layout["pageSize"] as? [String: Double], let width = size["widthPt"], let height = size["heightPt"],
        abs(width - 148 * 72 / 25.4) < 0.1, abs(height - 210 * 72 / 25.4) < 0.1,
        let mediaData = mediaJson.data(using: .utf8), let media = try JSONSerialization.jsonObject(with: mediaData) as? [String: String] else { throw printFailure("INVALID_LAYOUT") }
  let target = try printLocalURL(destination)
  var bounds = CGRect(x: 0, y: 0, width: width, height: height)
  guard let context = CGContext(target as CFURL, mediaBox: &bounds, nil) else { throw printFailure("PDF_CREATE_FAILED") }
  for page in pages {
    try autoreleasepool {
      // Fail explicitly for a copy that cannot be decoded; never silently substitute a missing photo.
      for block in page["blocks"] as? [[String: Any]] ?? [] {
        if ["image", "cover-image"].contains(block["kind"] as? String ?? "") {
          guard let id = block["assetId"] as? String, let path = media[id],
                UIImage(contentsOfFile: try printLocalURL(path).path) != nil else { context.closePDF(); throw printFailure("IMAGE_UNREADABLE") }
        }
      }
      context.beginPDFPage(nil)
      context.saveGState()
      context.translateBy(x: 0, y: bounds.height)
      context.scaleBy(x: 1, y: -1)
      UIGraphicsPushContext(context)
      drawAlbumPage(page: page, media: media, playing: [], in: context, bounds: bounds)
      UIGraphicsPopContext()
      context.restoreGState()
      context.endPDFPage()
    }
  }
  context.closePDF()
  guard let pdf = CGPDFDocument(target as CFURL), let searchable = PDFDocument(url: target), searchable.pageCount == pages.count else { throw printFailure("PDF_REOPEN_FAILED") }
  var selectable = true
  var textCheckFailure: String?
  var colorGlyphRanges: [[String: Int]] = []
  var runs = Set<String>()
  for (index, page) in pages.enumerated() {
    let text = compactPdfText(searchable.page(at: index)?.string ?? "")
    let rendering = page["rendering"] as? [String: Any] ?? [:]
    if let publication = page["publication"] as? [String: Any], ["keepsake-v1", "keepsake-v2"].contains(publication["version"] as? String ?? ""),
       ["archive", "chapter"].contains(publication["kind"] as? String ?? "") {
      var required = [publication["title"] as? String ?? "", publication["eyebrow"] as? String ?? "", publication["ordinal"] as? String ?? "", publication["made"] as? String ?? ""]
      if publication["kind"] as? String == "archive" {
        required.append(publication["line"] as? String ?? "")
        for stat in publication["stats"] as? [[String: Any]] ?? [] {
          required.append("\(stat["value"] as? Int ?? 0)")
          required.append(stat["label"] as? String ?? "")
        }
      }
      if required.map(compactPdfText).contains(where: { !$0.isEmpty && !text.contains($0) }) {
        throw printFailure("PDF_PUBLICATION_TEXT")
      }
    }
    for (blockIndex, block) in (page["blocks"] as? [[String: Any]] ?? []).enumerated() {
      let kind = block["kind"] as? String ?? ""
      let source = block["text"] as? String ?? block["label"] as? String ?? block["value"] as? String ?? ""
      let serif = ["cover-name", "note", "opening", "close"].contains(kind)
      let name = (kind == "note" ? rendering["bodySerif"] as? String : nil) ?? rendering[serif ? "serif" : "ui"] as? String ?? (serif ? "Songti SC" : "PingFang SC")
      let font = resolveFont(name: name, size: kind == "cover-name" ? 28 : serif ? 17 : 15)
      if ["cover-name", "note", "opening"].contains(kind) {
        let scalars = Array(source.unicodeScalars)
        let lines = block["lines"] as? [[String: Any]] ?? []
        let checks: [[String: Any]] = lines.isEmpty ? [["start": 0.0, "end": Double(scalars.count)]] : lines
        for (lineIndex, line) in checks.enumerated() {
          let start = Int(line["start"] as? Double ?? -1)
          let end = Int(line["end"] as? Double ?? -1)
          guard start >= 0, end >= start, end <= scalars.count else { throw printFailure("INVALID_LAYOUT") }
          let slice = scalars[start..<end].map { String($0) }.joined()
          let exclusions = try printColorGlyphRanges(slice, font: font)
          for range in exclusions {
            colorGlyphRanges.append(["page": index, "block": blockIndex, "line": lineIndex,
                                     "startUTF16": range.location, "endUTF16": NSMaxRange(range)])
          }
          let required = printRequiredSegments(slice, excluding: exclusions)
          if !printSegmentsMatch(required, in: text) {
            selectable = false
            if textCheckFailure == nil { textCheckFailure = "PDF_TEXT_V4_P\(index + 1)_B\(blockIndex + 1)_L\(lineIndex + 1)_E\(compactPdfText(slice).unicodeScalars.count)_A\(text.unicodeScalars.count)" }
          }
        }
      }
      if let initial = block["printInitial"] as? [String: Any], let count = initial["scalars"] as? Int, count > 0, count <= source.unicodeScalars.count {
        let glyph = Array(source.unicodeScalars).prefix(count).map { String($0) }.joined()
        for run in coreTextRunFontNames(text: glyph, font: resolveFont(name: name, size: CGFloat(initial["sizePt"] as? Double ?? 34))) { if let post = run["postScriptName"] { runs.insert(post) } }
      }
      for run in coreTextRunFontNames(text: source + (block["printHint"] as? String ?? ""), font: font) { if let post = run["postScriptName"] { runs.insert(post) } }
    }
  }
  let fonts = collectPageFonts(pdf)
  let streams = fonts.fonts.map { $0["embedStream"] as? String ?? "unknown" }
  let embedded: Any = fonts.hasUninspectedForm || streams.isEmpty || streams.contains("unknown") ? NSNull() : !streams.contains("none")
  let digest = try printFileDigest(destination)
  return ["pageCount": pdf.numberOfPages, "bytes": digest["bytes"] ?? 0, "sha256": digest["sha256"] ?? "",
          "widthPt": pdf.page(at: 1)?.getBoxRect(.mediaBox).width ?? 0, "heightPt": pdf.page(at: 1)?.getBoxRect(.mediaBox).height ?? 0,
          "fontsEmbedded": embedded, "fontResources": fonts.fonts, "textSelectable": selectable && colorGlyphRanges.isEmpty, "nonColorTextSelectable": selectable,
          "colorGlyphRanges": colorGlyphRanges, "emojiVisualCheckRequired": !colorGlyphRanges.isEmpty, "textCheckRevision": 4, "textCheckFailure": textCheckFailure ?? "", "fontRunNames": runs.sorted()]
}

/// New publications use the exact offline XHTML/CSS that composes Photo journal.
/// WebKit produces vector/text PDF pages; no full-page screenshots are used.
final class ChroniclePdfRenderer: NSObject, WKNavigationDelegate {
  private static var jobs: [UUID: ChroniclePdfRenderer] = [:] // main queue only
  private let id = UUID()
  private let publication: [String: Any]
  private let pages: [[String: Any]]
  private let media: [String: String]
  private let target: URL
  private let work: URL
  private let completion: (Result<[String: Any], Error>) -> Void
  private var webView: WKWebView?
  private var context: CGContext?
  private var cursor = 0
  private var finished = false
  private var timeout: DispatchWorkItem?
  private var background: NSObjectProtocol?
  private var assetByPath: [String: String] = [:]
  private var assetBytes: [String: Int] = [:]
  private var imageUseBytes = 0
  private var dpiByAsset: [String: Double] = [:]
  private var colorRanges: [[String: Int]] = []
  private var searchableChecks: [[ChronicleTextCheck]] = []
  private var phase = "PREPARE_HTML"
  private let bounds = CGRect(x: 0, y: 0, width: 600, height: 450)

  static func start(_ publication: String, _ media: String, _ destination: String, completion: @escaping (Result<[String: Any], Error>) -> Void) {
    do {
      let job = try ChroniclePdfRenderer(publication, media, destination, completion)
      jobs[job.id] = job
      job.begin()
    } catch { completion(.failure(error)) }
  }
  private init(_ raw: String, _ rawMedia: String, _ destination: String, _ complete: @escaping (Result<[String: Any], Error>) -> Void) throws {
    guard let data = raw.data(using: .utf8), let p = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          p["version"] as? Int == 1, let list = p["pages"] as? [[String: Any]], !list.isEmpty,
          list.first?["name"] as? String == "cover", list.last?["name"] as? String == "archive",
          let viewport = p["viewport"] as? [String: Int], viewport["width"] == 1200, viewport["height"] == 900,
          let bytes = rawMedia.data(using: .utf8), let sources = try JSONSerialization.jsonObject(with: bytes) as? [String: String] else { throw printFailure("INVALID_LAYOUT") }
    publication = p; pages = list; media = sources; completion = complete
    target = try printLocalURL(destination)
    work = target.deletingLastPathComponent().appendingPathComponent(".chronicle-render", isDirectory: true)
    super.init()
  }
  private func begin() {
    do {
      guard UIApplication.shared.applicationState == .active else { throw printFailure("CANCELLED") }
      try FileManager.default.createDirectory(at: work.appendingPathComponent("media"), withIntermediateDirectories: true)
      guard let css = publication["css"] as? String, let symbol = publication["symbol"] as? String else { throw printFailure("INVALID_LAYOUT") }
      try css.write(to: work.appendingPathComponent("style.css"), atomically: true, encoding: .utf8)
      try symbol.write(to: work.appendingPathComponent("lampy-symbol.svg"), atomically: true, encoding: .utf8)
      for asset in publication["assets"] as? [[String: String]] ?? [] {
        guard let assetId = asset["assetId"], let path = asset["path"],
              path.range(of: "^media/asset-[0-9]+\\.jpg$", options: .regularExpression) != nil,
              let raw = media[assetId] else { throw printFailure("INVALID_LAYOUT") }
        let source = try printLocalURL(raw)
        guard source.path.hasPrefix(target.deletingLastPathComponent().path + "/") else { throw printFailure("LOCAL_FILE_REQUIRED") }
        try FileManager.default.copyItem(at: source, to: work.appendingPathComponent(path))
        assetByPath[path] = assetId
        assetBytes[path] = (try printFileDigest(source.path))["bytes"] as? Int ?? 0
      }
      for page in pages {
        guard let name = page["name"] as? String, name.range(of: "^[a-z0-9-]+$", options: .regularExpression) != nil,
              let html = page["html"] as? String, !html.contains("<script") else { throw printFailure("INVALID_LAYOUT") }
        try html.write(to: work.appendingPathComponent(name + ".xhtml"), atomically: true, encoding: .utf8)
      }
      var box = bounds
      guard let output = CGContext(target as CFURL, mediaBox: &box, nil) else { throw printFailure("PDF_CREATE_FAILED") }
      context = output
      let configuration = WKWebViewConfiguration()
      configuration.websiteDataStore = .nonPersistent()
      let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 1200, height: 900), configuration: configuration)
      view.isOpaque = false; view.scrollView.isScrollEnabled = false; view.navigationDelegate = self
      webView = view
      background = NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in self?.finish(.failure(printFailure("CANCELLED"))) }
      loadPage()
    } catch { finish(.failure(error)) }
  }
  private func loadPage() {
    guard !finished else { return }
    if cursor == pages.count { completePdf(); return }
    guard UIApplication.shared.applicationState == .active, let name = pages[cursor]["name"] as? String else { finish(.failure(printFailure("CANCELLED"))); return }
    timeout?.cancel()
    let deadline = DispatchWorkItem { [weak self] in self?.finish(.failure(printFailure("PDF_CREATE_FAILED"))) }
    timeout = deadline; DispatchQueue.main.asyncAfter(deadline: .now() + 45, execute: deadline)
    phase = "LOAD_PAGE"
    webView?.loadFileURL(work.appendingPathComponent(name + ".xhtml"), allowingReadAccessTo: work)
  }
  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    if let url = navigationAction.request.url, url.isFileURL, url.standardizedFileURL.path.hasPrefix(work.path + "/") { decisionHandler(.allow) }
    else { decisionHandler(.cancel); finish(.failure(printFailure("INVALID_LAYOUT"))) }
  }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish(.failure(printFailure("PDF_CREATE_FAILED"))) }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish(.failure(printFailure("PDF_CREATE_FAILED"))) }
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { finish(.failure(printFailure("PDF_CREATE_FAILED"))) }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    guard !finished, cursor < pages.count else { return }
    phase = "CHECK_DOM"
    let page = pages[cursor]
    let inspect = """
    await document.fonts.ready;
    for(const image of document.images){if(image.decode)await image.decode();if(!image.complete||!image.naturalWidth)throw new Error('IMAGE_UNREADABLE');}
    const texts=[],textKinds=[],textBounds=[],images=[];
    const box=range=>{const r=range.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};};
    const role=el=>el.closest('.opening-copy')?'opening':el.closest('.opening-philosophy')?'philosophy':el.closest('.fixed-prose')?'writing':'imprint';
    const visible=el=>{for(let e=el;e;e=e.parentElement){const s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden')return false;}return true;};
    const inside=r=>r.left>=-4&&r.top>=-4&&r.right<=1204&&r.bottom<=904;
    const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    while(walk.nextNode()){const n=walk.currentNode;if(!n.nodeValue.trim()||!visible(n.parentElement))continue;const range=document.createRange();range.selectNodeContents(n);const rects=Array.from(range.getClientRects());if(rects.some(r=>!inside(r)))throw new Error('INVALID_LAYOUT');if(rects.length&&!n.parentElement.closest('[aria-hidden="true"]')){texts.push(n.nodeValue);textKinds.push(role(n.parentElement));textBounds.push(box(range));}}
    for(const image of document.images){if(!visible(image))continue;const r=image.getBoundingClientRect();if(!inside(r))throw new Error('INVALID_LAYOUT');images.push({path:image.getAttribute('src'),width:image.naturalWidth,height:image.naturalHeight,w:r.width,h:r.height});}
    const notes=recordPage?Array.from(document.querySelectorAll('.fixed-prose')).map(n=>n.textContent):[];
    const sourceBounds=sourceTexts.map(text=>{const node=Array.from(document.querySelectorAll('.fixed-prose,h1')).find(n=>n.textContent===text);if(!node)return null;const range=document.createRange();range.selectNodeContents(node);return box(range);});
    return {texts,textKinds,textBounds,sourceBounds,images,notes};
    """
    webView.callAsyncJavaScript(inspect, arguments: ["recordPage": (page["name"] as? String ?? "").hasPrefix("record-"), "sourceTexts": page["expectedText"] as? [String] ?? []], in: nil, in: .page) { [weak self] result in
      guard let self = self, !self.finished else { return }
      do {
        let info = try result.get() as? [String: Any]
        guard let info = info, let notes = info["notes"] as? [String], let expected = page["notes"] as? [String],
              notes.map(compactPdfText) == expected.map(compactPdfText) else { throw printFailure("INVALID_LAYOUT") }
        let configuration = WKPDFConfiguration(); configuration.rect = CGRect(x: 0, y: 0, width: 1200, height: 900)
        self.phase = "RENDER_PAGE"
        webView.createPDF(configuration: configuration) { [weak self] pdf in
          guard let self = self, !self.finished else { return }
          do { try self.append(try pdf.get(), info: info, page: page); self.cursor += 1; self.loadPage() }
          catch { self.finish(.failure(error)) }
        }
      } catch { self.finish(.failure(printFailure("INVALID_LAYOUT"))) }
    }
  }
  private func append(_ data: Data, info: [String: Any], page: [String: Any]) throws {
    guard let provider = CGDataProvider(data: data as CFData), let pdf = CGPDFDocument(provider), pdf.numberOfPages == 1,
          let source = pdf.page(at: 1), let searchable = PDFDocument(data: data), searchable.pageCount == 1, let textPage = searchable.page(at: 0), let context = context else { throw printFailure("PDF_REOPEN_FAILED") }
    phase = "CHECK_PAGE_TEXT"
    let actual = compactPdfText(textPage.string ?? "")
    let values = (info["texts"] as? [String] ?? []) + (page["expectedText"] as? [String] ?? [])
    let textBounds = info["textBounds"] as? [Any] ?? []
    let sourceBounds = info["sourceBounds"] as? [Any] ?? []
    var pageChecks: [ChronicleTextCheck] = []
    for (index, value) in values.enumerated() {
      let ranges = try printColorGlyphRanges(value, font: UIFont.systemFont(ofSize: 17))
      for range in ranges { colorRanges.append(["page": cursor, "block": index, "line": 0, "startUTF16": range.location, "endUTF16": NSMaxRange(range)]) }
      let required = printRequiredSegments(value, excluding: ranges)
      let domCount = (info["texts"] as? [String] ?? []).count
      let bounds = index < domCount ? textBounds : sourceBounds
      let offset = index < domCount ? index : index - domCount
      let rect = offset < bounds.count ? chronicleViewportRect(bounds[offset]) : nil
      let check = ChronicleTextCheck(parts: required, viewportRect: rect)
      guard printChronicleTextCheck(check, in: textPage) else {
        let kinds = info["textKinds"] as? [String] ?? []
        let role = index < kinds.count ? kinds[index] : "source"
        let kind = ["opening", "philosophy", "writing", "imprint", "source"].contains(role) ? role : "unknown"
        let sameCharacters = compactChroniclePdfText(required.joined()).unicodeScalars.map { $0.value }.sorted() == compactChroniclePdfText(actual).unicodeScalars.map { $0.value }.sorted()
        NSLog("[LampyPrint] stage=CHECK_PAGE_TEXT page=%ld check=%ld kind=%@ expected=%ld extracted=%ld sameCharacters=%@ code=PDF_TEXT",
              cursor + 1, index + 1, kind, required.joined().unicodeScalars.count, actual.unicodeScalars.count, sameCharacters ? "yes" : "no")
        throw printFailure("PDF_TEXT")
      }
      pageChecks.append(check)
    }
    searchableChecks.append(pageChecks)
    for image in info["images"] as? [[String: Any]] ?? [] {
      guard let path = image["path"] as? String, let assetId = assetByPath[path],
            let width = image["width"] as? Double, let height = image["height"] as? Double,
            let w = image["w"] as? Double, let h = image["h"] as? Double, w > 0, h > 0 else { continue }
      let dpi = min(width * 72 / (w * 0.5), height * 72 / (h * 0.5))
      dpiByAsset[assetId] = min(dpiByAsset[assetId] ?? dpi, dpi)
      imageUseBytes += assetBytes[path] ?? 0
    }
    context.beginPDFPage(nil)
    context.setFillColor(CGColor(red: 250.0/255.0, green: 249.0/255.0, blue: 245.0/255.0, alpha: 1)); context.fill(bounds)
    context.saveGState(); context.concatenate(source.getDrawingTransform(.mediaBox, rect: bounds, rotate: 0, preserveAspectRatio: true)); context.drawPDFPage(source); context.restoreGState()
    context.endPDFPage()
  }
  private func completePdf() {
    do {
      phase = "MERGE_FINAL"
      context?.closePDF(); context = nil
      guard let final = CGPDFDocument(target as CFURL), let text = PDFDocument(url: target), final.numberOfPages == pages.count, text.pageCount == pages.count else { throw printFailure("PDF_REOPEN_FAILED") }
      phase = "CHECK_FINAL_TEXT"
      guard searchableChecks.count == pages.count else { throw printFailure("INVALID_LAYOUT") }
      for (index, checks) in searchableChecks.enumerated() {
        guard let page = text.page(at: index), checks.allSatisfy({ printChronicleTextCheck($0, in: page) }) else {
          cursor = index
          throw printFailure("PDF_TEXT")
        }
      }
      phase = "CHECK_SIZE"
      let digest = try printFileDigest(target.path), bytes = digest["bytes"] as? Int ?? 0
      // Reject a resource explosion rather than publishing another enormous PDF.
      let budget = min(192 * 1024 * 1024, 8 * 1024 * 1024 + imageUseBytes * 3 + pages.count * 384 * 1024)
      guard bytes > 0, bytes <= budget else { throw printFailure("PRINT_PDF_TOO_LARGE") }
      phase = "CHECK_FONTS"
      let fonts = collectPageFonts(final)
      let streams = fonts.fonts.map { $0["embedStream"] as? String ?? "unknown" }
      let embedded: Any = fonts.hasUninspectedForm || streams.isEmpty || streams.contains("unknown") ? NSNull() : !streams.contains("none")
      let names = Array(Set(fonts.fonts.compactMap { $0["baseFont"] as? String }.filter { !$0.isEmpty })).sorted()
      guard !names.isEmpty else { throw printFailure("PDF_FONT_RUNS") }
      finish(.success(["pageCount": pages.count, "bytes": bytes, "sha256": digest["sha256"] ?? "", "widthPt": 600, "heightPt": 450,
                       "fontsEmbedded": embedded, "fontResources": fonts.fonts, "fontRunNames": names,
                       "textSelectable": colorRanges.isEmpty, "nonColorTextSelectable": true, "emojiVisualCheckRequired": !colorRanges.isEmpty,
                       "colorGlyphRanges": colorRanges, "textCheckRevision": 4,
                       "imageDpi": dpiByAsset.map { ["assetId": $0.key, "dpi": $0.value] }]))
    } catch { finish(.failure(error)) }
  }
  private func finish(_ result: Result<[String: Any], Error>) {
    guard !finished else { return }; finished = true
    if case .failure(let error) = result {
      let allowed = ["CANCELLED", "INVALID_LAYOUT", "LOCAL_FILE_REQUIRED", "PDF_CREATE_FAILED", "PDF_REOPEN_FAILED", "PDF_TEXT", "PRINT_PDF_TOO_LARGE", "PDF_FONT_RUNS", "IMAGE_UNREADABLE"]
      let code = allowed.first { $0 == (error as NSError).localizedDescription } ?? "PDF_CREATE_FAILED"
      // Deliberately exclude document text, album identifiers and local paths.
      NSLog("[LampyPrint] stage=%@ page=%ld code=%@", phase, min(cursor + 1, pages.count), code)
    }
    timeout?.cancel(); timeout = nil
    if let background = background { NotificationCenter.default.removeObserver(background) }; background = nil
    webView?.navigationDelegate = nil; webView?.stopLoading(); webView = nil
    context?.closePDF(); context = nil
    try? FileManager.default.removeItem(at: work)
    if case .failure = result { try? FileManager.default.removeItem(at: target) }
    ChroniclePdfRenderer.jobs.removeValue(forKey: id)
    completion(result)
  }
}
