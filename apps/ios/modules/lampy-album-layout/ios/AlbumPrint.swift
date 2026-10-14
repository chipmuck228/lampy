import CryptoKit
import CoreGraphics
import CoreText
import PDFKit
import UIKit

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
private func collectPageFonts(_ pdf: CGPDFDocument) -> FontCollector {
  let result = FontCollector()
  for index in 1...pdf.numberOfPages {
    guard let page = pdf.page(at: index), let pageDictionary = page.dictionary else { continue }
    var resources: CGPDFDictionaryRef?
    guard CGPDFDictionaryGetDictionary(pageDictionary, "Resources", &resources), let resources = resources else { continue }
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
           let dictionary = CGPDFStreamGetDictionary(stream),
           pdfName(dictionary, "Subtype") == "Form" { result.hasUninspectedForm = true }
      }, Unmanaged.passUnretained(result).toOpaque())
    }
  }
  return result
}
private func compactPdfText(_ value: String) -> String {
  value.precomposedStringWithCanonicalMapping.unicodeScalars.filter { !CharacterSet.whitespacesAndNewlines.contains($0) }.map { String($0) }.joined()
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
  context.closePDF()
  guard let pdf = CGPDFDocument(target as CFURL), let searchable = PDFDocument(url: target), searchable.pageCount == pages.count else { throw printFailure("PDF_REOPEN_FAILED") }
  var selectable = true
  var runs = Set<String>()
  for (index, page) in pages.enumerated() {
    let text = compactPdfText(searchable.page(at: index)?.string ?? "")
    let rendering = page["rendering"] as? [String: Any] ?? [:]
    for block in page["blocks"] as? [[String: Any]] ?? [] {
      let kind = block["kind"] as? String ?? ""
      let source = block["text"] as? String ?? block["label"] as? String ?? block["value"] as? String ?? ""
      if ["cover-name", "note", "opening"].contains(kind) {
        // CoreText draws separate lines. PDFKit may interleave nearby blocks when
        // reconstructing reading order, so a whole paragraph need not be contiguous.
        // Require every drawn line, preserving character order within that line.
        let scalars = Array(source.unicodeScalars)
        let lines = block["lines"] as? [[String: Any]] ?? []
        if lines.isEmpty {
          let expected = compactPdfText(source)
          if !expected.isEmpty && !text.contains(expected) { selectable = false }
        } else {
          for line in lines {
            let start = Int(line["start"] as? Double ?? -1)
            let end = Int(line["end"] as? Double ?? -1)
            guard start >= 0, end >= start, end <= scalars.count else { selectable = false; continue }
            let expected = compactPdfText(scalars[start..<end].map { String($0) }.joined())
            if !expected.isEmpty && !text.contains(expected) { selectable = false }
          }
        }
      }
      let serif = ["cover-name", "note", "opening", "close"].contains(kind)
      let name = rendering[serif ? "serif" : "ui"] as? String ?? (serif ? "Songti SC" : "PingFang SC")
      let font = resolveFont(name: name, size: kind == "cover-name" ? 28 : serif ? 17 : 15)
      for run in coreTextRunFontNames(text: source + (block["printHint"] as? String ?? ""), font: font) { if let post = run["postScriptName"] { runs.insert(post) } }
    }
  }
  let fonts = collectPageFonts(pdf)
  let streams = fonts.fonts.map { $0["embedStream"] as? String ?? "unknown" }
  let embedded: Any = fonts.hasUninspectedForm || streams.isEmpty || streams.contains("unknown") ? NSNull() : !streams.contains("none")
  let digest = try printFileDigest(destination)
  return ["pageCount": pdf.numberOfPages, "bytes": digest["bytes"] ?? 0, "sha256": digest["sha256"] ?? "",
          "widthPt": pdf.page(at: 1)?.getBoxRect(.mediaBox).width ?? 0, "heightPt": pdf.page(at: 1)?.getBoxRect(.mediaBox).height ?? 0,
          "fontsEmbedded": embedded, "fontResources": fonts.fonts, "textSelectable": selectable, "fontRunNames": runs.sorted()]
}
