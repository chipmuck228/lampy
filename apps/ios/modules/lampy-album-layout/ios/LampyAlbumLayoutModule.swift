import CoreText
import ExpoModulesCore
import UIKit
import WebKit

public final class LampyAlbumLayoutModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LampyAlbumLayout")

    Function("measureText") { (text: String, fontName: String, sizePt: Double, lineHeightPt: Double, widthPt: Double) -> [[String: Double]] in
      measureText(text: text, fontName: fontName, sizePt: sizePt, lineHeightPt: lineHeightPt, widthPt: widthPt)
    }

    Function("diagnoseFonts") { (serif: String, ui: String) -> [String: Any] in
      diagnoseAlbumFonts(serifName: serif, uiName: ui)
    }

    AsyncFunction("writeProbePdf") { (layoutJson: String, mediaJson: String, destPath: String) -> [String: Any] in
      try writeProbePdf(layoutJson: layoutJson, mediaJson: mediaJson, destPath: destPath)
    }

    AsyncFunction("copyPrintMedia") { (source: String, destination: String) -> [String: Any] in
      try copyPrintMedia(source, destination)
    }
    AsyncFunction("prepareEpubImage") { (source: String, destination: String) -> [String: Any] in
      try prepareEpubImage(source, destination)
    }
    AsyncFunction("preparePrintImage") { (source: String, destination: String) -> [String: Any] in
      try preparePrintImage(source, destination)
    }
    AsyncFunction("writeChroniclePdf") { (publication: String, media: String, destination: String, promise: Promise) in
      DispatchQueue.main.async {
        ChroniclePdfRenderer.start(publication, media, destination) { result in
          switch result {
          case .success(let value): promise.resolve(value)
          case .failure(let error):
            let code = (error as NSError).localizedDescription
            promise.reject(code, code)
          }
        }
      }
    }
    AsyncFunction("printFileDigest") { (path: String) -> [String: Any] in
      try printFileDigest(path)
    }
    AsyncFunction("writePrintPdf") { (layout: String, media: String, destination: String) -> [String: Any] in
      try writePrintPdf(layout, media, destination)
    }
    AsyncFunction("sharePrintPdf") { (path: String, promise: Promise) in
      DispatchQueue.main.async {
        do {
          let url = try printLocalURL(path)
          guard UIApplication.shared.applicationState == .active,
                FileManager.default.fileExists(atPath: url.path),
                var controller = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).flatMap({ $0.windows }).first(where: { $0.isKeyWindow })?.rootViewController else {
            promise.reject("SHARE_UNAVAILABLE", "SHARE_UNAVAILABLE"); return
          }
          while let presented = controller.presentedViewController { controller = presented }
          let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
          sheet.popoverPresentationController?.sourceView = controller.view
          sheet.popoverPresentationController?.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 1, height: 1)
          sheet.completionWithItemsHandler = { _, completed, _, error in
            if error != nil { promise.reject("SHARE_FAILED", "SHARE_FAILED") }
            else { promise.resolve(completed) }
          }
          controller.present(sheet, animated: true)
        } catch { promise.reject("SHARE_FAILED", "SHARE_FAILED") }
      }
    }

    Function("epubPreviewAvailable") { true }
    View(AlbumPageView.self) {
      Prop("pageJson") { (view: AlbumPageView, json: String) in
        view.pageJson = json
      }
      Prop("mediaJson") { (view: AlbumPageView, json: String) in
        view.mediaJson = json
      }
      Prop("playingJson") { (view: AlbumPageView, json: String) in
        if view.playingJson != json {
          view.playingJson = json
        }
      }
      Prop("renderScale") { (view: AlbumPageView, scale: Double) in
        view.renderScale = scale
      }
    }
    // Keep AlbumPageView first: Expo uses the first view as the legacy default.
    View(AlbumEpubView.self) {
      Events("onReady", "onFailure", "onPageTurn")
      Prop("rootUri") { (view: AlbumEpubView, value: String) in view.rootUri = value }
      Prop("documentUri") { (view: AlbumEpubView, value: String) in view.documentUri = value }
    }
  }
}

private struct ResolvedAlbumFont {
  let requested: String
  let familyName: String
  let fontName: String
  let matchedRequestedFamily: Bool
  let usedSystemFallback: Bool

  func asDictionary() -> [String: Any] {
    [
      "requested": requested,
      "familyName": familyName,
      "fontName": fontName,
      "matchedRequestedFamily": matchedRequestedFamily,
      "usedSystemFallback": usedSystemFallback,
    ]
  }
}

/// Shared by measure, preview draw, and PDF probe. Never invents a Songti claim after falling back.
private func resolveAlbumFont(name: String, size: CGFloat) -> (UIFont, ResolvedAlbumFont) {
  let requestedFamily = name
  let isPingFang = name.localizedCaseInsensitiveContains("PingFang")
  let isKaiti = name.localizedCaseInsensitiveContains("Kaiti")
  let isSongti = name.localizedCaseInsensitiveContains("Songti") || name.localizedCaseInsensitiveContains("STSong")
  var candidates: [String] = [name]
  if isKaiti {
    candidates += ["KaitiSC-Regular", "STKaiti", "Kaiti SC", "KaiTi"]
    candidates += UIFont.familyNames.filter { $0.localizedCaseInsensitiveContains("Kaiti") }.flatMap { UIFont.fontNames(forFamilyName: $0) }
  } else if isPingFang {
    candidates += [
      "PingFangSC-Regular",
      "PingFang SC",
      "PingFangSC-Light",
      "PingFangSC-Medium",
    ]
    candidates += UIFont.fontNames(forFamilyName: "PingFang SC")
  } else if isSongti {
    candidates += [
      "STSongti-SC-Regular",
      "STSongti-SC-Light",
      "STSongti-SC-Black",
      "Songti SC",
      "SongtiSC-Regular",
      "STSong",
    ]
    candidates += UIFont.fontNames(forFamilyName: "Songti SC")
    candidates += UIFont.fontNames(forFamilyName: "STSong")
  }
  var seen = Set<String>()
  for candidate in candidates where seen.insert(candidate).inserted {
    if let font = UIFont(name: candidate, size: size) {
      let family = font.familyName
      let normalizedFamily = family.replacingOccurrences(of: " ", with: "")
      let normalizedRequested = requestedFamily.replacingOccurrences(of: " ", with: "")
      let matched =
        normalizedFamily.localizedCaseInsensitiveContains(normalizedRequested)
        || normalizedRequested.localizedCaseInsensitiveContains(normalizedFamily)
        || (isKaiti && family.localizedCaseInsensitiveContains("Kaiti"))
        || (isSongti && (family.localizedCaseInsensitiveContains("Songti") || family.localizedCaseInsensitiveContains("STSong")))
        || (isPingFang && family.localizedCaseInsensitiveContains("PingFang"))
      return (
        font,
        ResolvedAlbumFont(
          requested: requestedFamily,
          familyName: family,
          fontName: font.fontName,
          matchedRequestedFamily: matched,
          usedSystemFallback: false
        )
      )
    }
  }
  if isKaiti {
    let fallback = resolveAlbumFont(name: "Songti SC", size: size)
    return (fallback.0, ResolvedAlbumFont(requested: requestedFamily, familyName: fallback.1.familyName, fontName: fallback.1.fontName, matchedRequestedFamily: false, usedSystemFallback: true))
  }
  if isSongti {
    let descriptor = UIFontDescriptor(fontAttributes: [
      .family: "Songti SC",
      .size: size,
    ])
    let font = UIFont(descriptor: descriptor, size: size)
    if font.familyName.localizedCaseInsensitiveContains("Songti")
      || font.familyName.localizedCaseInsensitiveContains("STSong")
    {
      return (
        font,
        ResolvedAlbumFont(
          requested: requestedFamily,
          familyName: font.familyName,
          fontName: font.fontName,
          matchedRequestedFamily: true,
          usedSystemFallback: false
        )
      )
    }
  }
  let system = UIFont.systemFont(ofSize: size)
  return (
    system,
    ResolvedAlbumFont(
      requested: requestedFamily,
      familyName: system.familyName,
      fontName: system.fontName,
      matchedRequestedFamily: false,
      usedSystemFallback: true
    )
  )
}

func resolveFont(name: String, size: CGFloat) -> UIFont {
  resolveAlbumFont(name: name, size: size).0
}

/// Dev-only probe samples. Fixed strings only — never caller body text.
private func diagnoseAlbumFonts(serifName: String, uiName: String) -> [String: Any] {
  let serif = resolveAlbumFont(name: serifName, size: 17)
  let ui = resolveAlbumFont(name: uiName, size: 15)
  let cover = resolveAlbumFont(name: serifName, size: 28)
  let families = UIFont.familyNames
    .filter {
      $0.localizedCaseInsensitiveContains("Song")
        || $0.localizedCaseInsensitiveContains("PingFang")
        || $0.localizedCaseInsensitiveContains("STSong")
    }
    .sorted()
  let runFonts = coreTextRunFontNames(
    text: "字Aa.，😀",
    font: serif.0
  )
  return [
    "serif": serif.1.asDictionary(),
    "ui": ui.1.asDictionary(),
    "cover": cover.1.asDictionary(),
    "availableRelatedFamilies": families,
    "serifCoreTextRunFonts": runFonts,
    "probeSample": "字Aa.，😀",
  ]
}

func coreTextRunFontNames(text: String, font: UIFont) -> [[String: String]] {
  let attributed = NSAttributedString(string: text, attributes: [.font: font])
  let line = CTLineCreateWithAttributedString(attributed)
  let runs = CTLineGetGlyphRuns(line) as? [CTRun] ?? []
  var out: [[String: String]] = []
  var seen = Set<String>()
  for run in runs {
    let attrs = CTRunGetAttributes(run) as NSDictionary
    guard let ctFont = attrs[kCTFontAttributeName] else { continue }
    let ref = (ctFont as! CTFont)
    let ps = (CTFontCopyPostScriptName(ref) as String?) ?? ""
    let family = (CTFontCopyFamilyName(ref) as String?) ?? ""
    let key = "\(family)|\(ps)"
    if seen.insert(key).inserted {
      out.append(["familyName": family, "postScriptName": ps])
    }
  }
  return out
}

private func utf16ToScalarMap(_ text: String) -> [Int] {
  var map = Array(repeating: 0, count: text.utf16.count + 1)
  var scalarIndex = 0
  var utf16Index = 0
  for scalar in text.unicodeScalars {
    let unitCount = String(scalar).utf16.count
    for _ in 0..<unitCount {
      if utf16Index < map.count {
        map[utf16Index] = scalarIndex
      }
      utf16Index += 1
    }
    scalarIndex += 1
  }
  if utf16Index < map.count {
    map[utf16Index] = scalarIndex
  }
  return map
}

private func measureText(text: String, fontName: String, sizePt: Double, lineHeightPt: Double, widthPt: Double) -> [[String: Double]] {
  if text.isEmpty {
    return []
  }
  let font = resolveFont(name: fontName, size: CGFloat(sizePt))
  let paragraph = NSMutableParagraphStyle()
  paragraph.minimumLineHeight = CGFloat(lineHeightPt)
  paragraph.maximumLineHeight = CGFloat(lineHeightPt)
  paragraph.lineBreakMode = .byWordWrapping
  let attributed = NSAttributedString(
    string: text,
    attributes: [
      .font: font,
      .paragraphStyle: paragraph,
      .foregroundColor: UIColor(red: 0x25 / 255, green: 0x23 / 255, blue: 0x1f / 255, alpha: 1),
    ]
  )
  let typesetter = CTTypesetterCreateWithAttributedString(attributed)
  let map = utf16ToScalarMap(text)
  let utf16Count = text.utf16.count
  var utf16Start = 0
  var lines: [[String: Double]] = []
  while utf16Start < utf16Count {
    let breakCount = CTTypesetterSuggestLineBreak(typesetter, utf16Start, widthPt)
    var utf16End = utf16Start + Int(breakCount)
    if utf16End <= utf16Start {
      utf16End = min(utf16Count, utf16Start + 1)
    }
    let line = CTTypesetterCreateLine(typesetter, CFRange(location: utf16Start, length: utf16End - utf16Start))
    var ascent: CGFloat = 0
    var descent: CGFloat = 0
    var leading: CGFloat = 0
    let advance = CTLineGetTypographicBounds(line, &ascent, &descent, &leading)
    let startScalar = map[min(utf16Start, map.count - 1)]
    let endScalar = map[min(utf16End, map.count - 1)]
    lines.append([
      "start": Double(startScalar),
      "end": Double(max(endScalar, startScalar)),
      "widthPt": Double(advance),
      "heightPt": lineHeightPt,
      "ascentPt": Double(ascent),
    ])
    utf16Start = utf16End
  }
  return lines
}

private func writeProbePdf(layoutJson: String, mediaJson: String, destPath: String) throws -> [String: Any] {
  guard
    let layoutData = layoutJson.data(using: .utf8),
    let layout = try JSONSerialization.jsonObject(with: layoutData) as? [String: Any],
    let pages = layout["pages"] as? [[String: Any]]
  else {
    throw NSError(domain: "LampyAlbumLayout", code: 1, userInfo: [NSLocalizedDescriptionKey: "invalid layout json"])
  }
  let media = parseAlbumMedia(mediaJson)
  let pageWidth = CGFloat((layout["pageSize"] as? [String: Any])?["widthPt"] as? Double ?? 420)
  let pageHeight = CGFloat((layout["pageSize"] as? [String: Any])?["heightPt"] as? Double ?? 595)
  let bounds = CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight)
  let renderer = UIGraphicsPDFRenderer(bounds: bounds)
  let data = renderer.pdfData { context in
    for page in pages {
      context.beginPage()
      drawAlbumPage(page: page, media: media, playing: [], in: context.cgContext, bounds: bounds)
    }
  }
  let url = URL(fileURLWithPath: destPath)
  try data.write(to: url, options: .atomic)
  let rendering = pages.first?["rendering"] as? [String: Any] ?? [:]
  let resolvedSerif = resolveAlbumFont(name: rendering["serif"] as? String ?? "Songti SC", size: 17).1
  let resolvedUi = resolveAlbumFont(name: rendering["ui"] as? String ?? "PingFang SC", size: 15).1
  let inspection = inspectPdfFontResources(data)
  return [
    "path": destPath,
    "pageCount": pages.count,
    "bytes": data.count,
    // null = cannot claim every requested face is embedded from a keyword scan alone
    "fontsEmbedded": inspection["fontsEmbedded"] as Any,
    "fontNames": inspection["baseFonts"] as Any,
    "fontResources": inspection["fontResources"] as Any,
    "preliminaryFontFileScan": inspection["preliminaryFontFileScan"] as Any,
    "resolvedDrawFonts": [
      "serif": resolvedSerif.asDictionary(),
      "ui": resolvedUi.asDictionary(),
    ],
  ]
}

/// Preliminary `/FontFile` scan is only a hint. Per-dictionary resources are authoritative for reporting.
private func inspectPdfFontResources(_ data: Data) -> [String: Any] {
  guard let latin = String(data: data, encoding: .isoLatin1) else {
    return [
      "preliminaryFontFileScan": false,
      "fontsEmbedded": NSNull(),
      "baseFonts": [] as [String],
      "fontResources": [] as [[String: Any]],
    ]
  }
  let preliminary = latin.contains("/FontFile")
  var baseFonts: [String] = []
  var resources: [[String: Any]] = []
  // Walk each `/Type /Font` dictionary roughly by taking a window after the marker.
  var search = latin.startIndex
  while let typeRange = latin.range(of: "/Type /Font", range: search..<latin.endIndex) {
    let windowEnd = latin.index(typeRange.upperBound, offsetBy: 500, limitedBy: latin.endIndex) ?? latin.endIndex
    let window = String(latin[typeRange.lowerBound..<windowEnd])
    let base = firstPdfName(after: "/BaseFont", in: window) ?? ""
    let subtype = firstPdfName(after: "/Subtype", in: window) ?? ""
    var embed: String = "none"
    if window.contains("/FontFile3") { embed = "FontFile3" }
    else if window.contains("/FontFile2") { embed = "FontFile2" }
    else if window.contains("/FontFile") { embed = "FontFile" }
    // Font descriptors often sit in later objects; mark unknown when BaseFont exists but stream is elsewhere.
    if embed == "none", !base.isEmpty {
      embed = "unknown"
    }
    if !base.isEmpty {
      baseFonts.append(base)
      resources.append([
        "baseFont": base,
        "subtype": subtype,
        "embedStream": embed,
      ])
    }
    search = typeRange.upperBound
  }
  // fontsEmbedded: true only if every listed font resource has a concrete embed stream in its window;
  // otherwise null (unknown) — never invent false certainty from a global keyword.
  let concrete = resources.filter { ($0["embedStream"] as? String) == "FontFile" || ($0["embedStream"] as? String) == "FontFile2" || ($0["embedStream"] as? String) == "FontFile3" }
  let fontsEmbedded: Any
  if resources.isEmpty {
    fontsEmbedded = NSNull()
  } else if concrete.count == resources.count {
    fontsEmbedded = true
  } else if preliminary {
    fontsEmbedded = NSNull()
  } else {
    fontsEmbedded = NSNull()
  }
  return [
    "preliminaryFontFileScan": preliminary,
    "fontsEmbedded": fontsEmbedded,
    "baseFonts": Array(Set(baseFonts)).sorted(),
    "fontResources": resources,
  ]
}

private func firstPdfName(after marker: String, in window: String) -> String? {
  guard let range = window.range(of: marker) else { return nil }
  var i = range.upperBound
  while i < window.endIndex, window[i].isWhitespace { i = window.index(after: i) }
  guard i < window.endIndex, window[i] == "/" else { return nil }
  i = window.index(after: i)
  let start = i
  while i < window.endIndex {
    let ch = window[i]
    if ch.isWhitespace || ch == "/" || ch == "[" || ch == "]" || ch == "(" || ch == ")" || ch == "<" || ch == ">" || ch == "{" || ch == "}" {
      break
    }
    i = window.index(after: i)
  }
  let name = String(window[start..<i])
  return name.isEmpty ? nil : name
}

private func albumPaperColor() -> UIColor {
  UIColor(red: 0xf3 / 255, green: 0xf0 / 255, blue: 0xe9 / 255, alpha: 1)
}

private func albumInkColor() -> UIColor {
  UIColor(red: 0x25 / 255, green: 0x23 / 255, blue: 0x1f / 255, alpha: 1)
}

private func albumSageColor() -> UIColor {
  UIColor(red: 0x53 / 255, green: 0x60 / 255, blue: 0x4f / 255, alpha: 1)
}

private func albumInkSoftColor() -> UIColor {
  UIColor(red: 0x5c / 255, green: 0x58 / 255, blue: 0x51 / 255, alpha: 1)
}

private func sliceAlbumScalars(_ text: String, start: Int, end: Int) -> String {
  let scalars = Array(text.unicodeScalars)
  let lo = max(0, min(start, scalars.count))
  let hi = max(lo, min(end, scalars.count))
  return String(String.UnicodeScalarView(scalars[lo..<hi]))
}

private func drawAlbumTextAtBaseline(
  text: String,
  font: UIFont,
  color: UIColor,
  x: CGFloat,
  baselineY: CGFloat,
  in context: CGContext
) {
  if text.isEmpty { return }
  let attributed = NSAttributedString(
    string: text,
    attributes: [.font: font, .foregroundColor: color]
  )
  let line = CTLineCreateWithAttributedString(attributed)
  context.saveGState()
  context.textMatrix = CGAffineTransform(scaleX: 1, y: -1)
  context.textPosition = CGPoint(x: x, y: baselineY)
  CTLineDraw(line, context)
  context.restoreGState()
}

private func albumFontForKind(_ kind: String, serif: String, ui: String) -> (name: String, size: CGFloat, color: UIColor) {
  switch kind {
  case "cover-name":
    return (serif, 28, albumInkColor())
  case "note", "opening", "close":
    return (serif, 17, albumInkColor())
  case "day-rule":
    return (ui, 15, albumSageColor())
  default:
    return (ui, 15, albumInkSoftColor())
  }
}

private func parseAlbumMedia(_ mediaJson: String) -> [String: String] {
  guard
    let mediaData = mediaJson.data(using: .utf8),
    let parsed = try? JSONSerialization.jsonObject(with: mediaData) as? [String: String]
  else {
    return [:]
  }
  return parsed
}

private func drawAudioGlyph(playing: Bool, at origin: CGPoint) {
  albumInkSoftColor().setFill()
  if playing {
    UIBezierPath(rect: CGRect(x: origin.x, y: origin.y + 2, width: 5, height: 14)).fill()
    UIBezierPath(rect: CGRect(x: origin.x + 9, y: origin.y + 2, width: 5, height: 14)).fill()
    return
  }
  let path = UIBezierPath()
  path.move(to: CGPoint(x: origin.x, y: origin.y))
  path.addLine(to: CGPoint(x: origin.x + 14, y: origin.y + 9))
  path.addLine(to: CGPoint(x: origin.x, y: origin.y + 18))
  path.close()
  path.fill()
}

private func albumHexColor(_ value: String?, fallback: UIColor) -> UIColor {
  guard let value = value, value.hasPrefix("#"), value.count == 7,
        let rgb = UInt32(value.dropFirst(), radix: 16) else { return fallback }
  return UIColor(red: CGFloat((rgb >> 16) & 255) / 255,
                 green: CGFloat((rgb >> 8) & 255) / 255,
                 blue: CGFloat(rgb & 255) / 255, alpha: 1)
}


// Print-only, frozen publication furniture. Record boxes and measured source text
// are untouched; ornaments live in the already reserved margins.
private func drawPublicationText(_ text: String, font: UIFont, color: UIColor, rect: CGRect, alignment: NSTextAlignment = .left, truncate: Bool = false) {
  let paragraph = NSMutableParagraphStyle()
  paragraph.alignment = alignment
  paragraph.lineBreakMode = truncate ? .byTruncatingTail : .byWordWrapping
  (text as NSString).draw(in: rect, withAttributes: [.font: font, .foregroundColor: color, .paragraphStyle: paragraph])
}
private func drawPublication(_ publication: [String: Any], page: [String: Any], bounds: CGRect, serif: String, ui: String, in context: CGContext) -> Bool {
  let kind = publication["kind"] as? String ?? "body"
  let title = publication["title"] as? String ?? ""
  let eyebrow = publication["eyebrow"] as? String ?? "LAMPY"
  let color = albumSageColor()
  context.saveGState()
  defer { context.restoreGState() }
  context.setStrokeColor(color.withAlphaComponent(0.35).cgColor)
  context.setLineWidth(0.5)
  if kind == "cover" {
    context.stroke(bounds.insetBy(dx: 18, dy: 18))
    drawPublicationText("LAMPY / A LIFE ALBUM", font: resolveFont(name: ui, size: 8), color: color, rect: CGRect(x: 36, y: 23, width: bounds.width - 72, height: 12))
    return false
  }
  if kind == "archive" || kind == "chapter" {
    drawPublicationText(eyebrow, font: resolveFont(name: ui, size: 9), color: color, rect: CGRect(x: 40, y: 64, width: bounds.width - 80, height: 32))
    if kind == "chapter" {
      drawPublicationText(publication["ordinal"] as? String ?? "", font: resolveFont(name: serif, size: 116), color: color.withAlphaComponent(0.25), rect: CGRect(x: 36, y: 136, width: bounds.width - 72, height: 150))
      drawPublicationText(title, font: resolveFont(name: serif, size: 29), color: albumInkColor(), rect: CGRect(x: 40, y: 309, width: bounds.width - 80, height: 135))
      context.move(to: CGPoint(x: 40, y: 466)); context.addLine(to: CGPoint(x: 88, y: 466)); context.strokePath()
    } else {
      drawPublicationText("L", font: resolveFont(name: serif, size: 38), color: color, rect: CGRect(x: 40, y: 124, width: 52, height: 52))
      drawPublicationText(title, font: resolveFont(name: serif, size: 29), color: albumInkColor(), rect: CGRect(x: 40, y: 200, width: bounds.width - 80, height: 84))
      drawPublicationText(publication["line"] as? String ?? "", font: resolveFont(name: serif, size: 13), color: albumInkSoftColor(), rect: CGRect(x: 40, y: 294, width: bounds.width - 80, height: 60))
      let stats = publication["stats"] as? [[String: Any]] ?? []
      let column = (bounds.width - 80) / CGFloat(max(1, stats.count))
      for (index, stat) in stats.enumerated() {
        let x = 40 + CGFloat(index) * column
        drawPublicationText("\(stat["value"] as? Int ?? 0)", font: resolveFont(name: serif, size: 34), color: albumInkColor(), rect: CGRect(x: x, y: 386, width: column - 6, height: 52))
        drawPublicationText(stat["label"] as? String ?? "", font: resolveFont(name: ui, size: 10), color: color, rect: CGRect(x: x, y: 440, width: column - 6, height: 36))
      }
      drawPublicationText(publication["made"] as? String ?? "", font: resolveFont(name: ui, size: 9), color: albumInkSoftColor(), rect: CGRect(x: 40, y: 510, width: bounds.width - 80, height: 28))
    }
    return true
  }
  if kind == "body" {
    drawPublicationText(title, font: resolveFont(name: ui, size: 8), color: albumInkSoftColor(), rect: CGRect(x: 36, y: 15, width: bounds.width - 72, height: 13), truncate: true)
    context.move(to: CGPoint(x: 36, y: 31)); context.addLine(to: CGPoint(x: bounds.width - 36, y: 31)); context.strokePath()
    let folio = String(format: "%02d", (page["index"] as? Int ?? 0) + 1)
    drawPublicationText(folio, font: resolveFont(name: serif, size: 10), color: color, rect: CGRect(x: bounds.width / 2 - 24, y: bounds.height - 30, width: 48, height: 16), alignment: .center)
  }
  if kind == "closing" {
    context.stroke(CGRect(x: 36, y: 65, width: 32, height: 1))
    drawPublicationText("LAMPY", font: resolveFont(name: ui, size: 10), color: color, rect: CGRect(x: 36, y: bounds.height - 70, width: bounds.width - 72, height: 20))
  }
  return false
}

func drawAlbumPage(
  page: [String: Any],
  media: [String: String],
  playing: [String],
  in context: CGContext,
  bounds: CGRect
) {
  let rendering = page["rendering"] as? [String: Any] ?? [:]
  albumHexColor(rendering["paper"] as? String, fallback: albumPaperColor()).setFill()
  context.fill(bounds)
  let serifName = rendering["serif"] as? String ?? "Songti SC"
  let bodyName = rendering["bodySerif"] as? String ?? serifName
  let uiName = rendering["ui"] as? String ?? "PingFang SC"
  let copy = rendering["copy"] as? [String: String] ?? [:]
  if let publication = page["publication"] as? [String: Any], ["keepsake-v1", "keepsake-v2"].contains(publication["version"] as? String ?? "") {
    if drawPublication(publication, page: page, bounds: bounds, serif: serifName, ui: uiName, in: context) { return }
  }
  if rendering["pageNumbers"] as? Bool == true {
    let count = rendering["pageCount"] as? Int ?? 1
    let number = (page["index"] as? Int ?? 0) + 1
    let font = resolveFont(name: uiName, size: 10)
    drawAlbumTextAtBaseline(text: "\(number) / \(count)", font: font, color: albumInkSoftColor(), x: bounds.width / 2 - 12, baselineY: bounds.height - 20, in: context)
  }
  if rendering["chroniclePrint"] as? Bool == true {
    if let edge = rendering["bindingColor"] as? String {
      context.setFillColor(albumHexColor(edge, fallback: albumSageColor()).cgColor)
      context.fill(CGRect(x: 18, y: 40, width: 5, height: bounds.height - 84))
    }
    let prose = (page["blocks"] as? [[String: Any]] ?? []).filter { $0["kind"] as? String == "note" }
    let hasMedia = (page["blocks"] as? [[String: Any]] ?? []).contains { ["image", "audio"].contains($0["kind"] as? String ?? "") }
    if !prose.isEmpty && !hasMedia {
      drawPublicationText("“", font: resolveFont(name: serifName, size: 32), color: albumSageColor().withAlphaComponent(0.4), rect: CGRect(x: 2, y: 62, width: 34, height: 44))
      drawPublicationText("”", font: resolveFont(name: serifName, size: 32), color: albumSageColor().withAlphaComponent(0.4), rect: CGRect(x: bounds.width - 36, y: bounds.height - 100, width: 34, height: 44))
      context.setStrokeColor(albumSageColor().withAlphaComponent(0.5).cgColor)
      context.setLineWidth(0.6)
      context.move(to: CGPoint(x: 36, y: bounds.height - 51)); context.addLine(to: CGPoint(x: 65, y: bounds.height - 51)); context.strokePath()
    }
  }
  let playingAssets = Set(playing)
  let blocks = page["blocks"] as? [[String: Any]] ?? []
  for block in blocks {
    let box = block["box"] as? [String: Any] ?? [:]
    let x = CGFloat(box["xPt"] as? Double ?? 0)
    let y = CGFloat(box["yPt"] as? Double ?? 0)
    let width = CGFloat(box["widthPt"] as? Double ?? 0)
    let height = CGFloat(box["heightPt"] as? Double ?? 0)
    let kind = block["kind"] as? String ?? ""
    if kind == "image" || kind == "cover-image" {
      let assetId = block["assetId"] as? String ?? ""
      let path = (media[assetId] ?? "").replacingOccurrences(of: "file://", with: "")
      if let image = UIImage(contentsOfFile: path) {
        let photoRect = CGRect(x: x, y: y, width: width, height: height)
        let border = min(CGFloat(rendering["photoBorderWidth"] as? Double ?? 0), min(width, height) / 4)
        if border > 0 {
          context.setFillColor(UIColor.white.cgColor)
          context.fill(photoRect)
        }
        let inner = photoRect.insetBy(dx: border, dy: border)
        let scale = min(inner.width / image.size.width, inner.height / image.size.height)
        let imageWidth = image.size.width * scale
        let imageHeight = image.size.height * scale
        image.draw(in: CGRect(x: inner.midX - imageWidth / 2, y: inner.midY - imageHeight / 2,
                              width: imageWidth, height: imageHeight))
      } else {
        UIColor(white: 0.9, alpha: 1).setFill()
        context.fill(CGRect(x: x, y: y, width: width, height: height))
        let missingFont = resolveFont(name: uiName, size: 15)
        drawAlbumTextAtBaseline(
          text: copy["imageMissing"] ?? "这张照片现在看不到。",
          font: missingFont,
          color: albumInkSoftColor(),
          x: x + 8,
          baselineY: y + missingFont.ascender,
          in: context
        )
      }
      continue
    }
    if kind == "feeling" {
      if rendering["chroniclePrint"] as? Bool == true { continue }
      let value = block["value"] as? String ?? ""
      albumHexColor(block["accent"] as? String, fallback: albumSageColor()).setFill()
      context.fillEllipse(in: CGRect(x: x, y: y + 7, width: 8, height: 8))
      let spec = albumFontForKind(kind, serif: kind == "note" ? bodyName : serifName, ui: uiName)
      let font = resolveFont(name: spec.name, size: spec.size)
      drawAlbumTextAtBaseline(
        text: value,
        font: font,
        color: spec.color,
        x: x + 16,
        baselineY: y + font.ascender,
        in: context
      )
      continue
    }
    if kind == "audio" {
      let assetId = block["assetId"] as? String ?? ""
      let spec = albumFontForKind(kind, serif: kind == "note" ? bodyName : serifName, ui: uiName)
      let font = resolveFont(name: spec.name, size: spec.size)
      let status = block["status"] as? String ?? ""
      if status == "available" {
        drawAudioGlyph(playing: playingAssets.contains(assetId), at: CGPoint(x: x, y: y + (min(height, 22) - 18) / 2))
      }
      let text = block["text"] as? String ?? ""
      if let hint = block["printHint"] as? String {
        drawAlbumTextAtBaseline(text: hint, font: font, color: spec.color, x: x + 26, baselineY: y + 22 + font.ascender, in: context)
      }
      drawAlbumTextAtBaseline(
        text: text,
        font: font,
        color: spec.color,
        x: x + (status == "available" ? 28 : 0),
        baselineY: y + font.ascender,
        in: context
      )
      continue
    }
    let spec = albumFontForKind(kind, serif: kind == "note" ? bodyName : serifName, ui: uiName)
    let font = resolveFont(name: spec.name, size: spec.size)
    let textColor = (kind == "note" && (rendering["chroniclePrint"] as? Bool) == true) ? albumHexColor(rendering["bodyColor"] as? String, fallback: UIColor(red: 16.0/255.0, green: 95.0/255.0, blue: 98.0/255.0, alpha: 1)) : spec.color
    if let lines = block["lines"] as? [[String: Any]], let text = block["text"] as? String, !lines.isEmpty {
      for line in lines {
        let start = Int(line["start"] as? Double ?? 0)
        let end = Int(line["end"] as? Double ?? 0)
        let lineX = CGFloat(line["xPt"] as? Double ?? x)
        let baseline = CGFloat(line["baselineYPt"] as? Double ?? Double(y) + Double(font.ascender))
        let slice = sliceAlbumScalars(text, start: start, end: end)
        if start == 0, let initial = block["printInitial"] as? [String: Any], let count = initial["scalars"] as? Int, count > 0, count <= end {
          let large = resolveFont(name: bodyName, size: CGFloat(initial["sizePt"] as? Double ?? 34))
          drawAlbumTextAtBaseline(text: sliceAlbumScalars(text, start: 0, end: count), font: large, color: textColor, x: lineX, baselineY: baseline, in: context)
          drawAlbumTextAtBaseline(text: sliceAlbumScalars(text, start: count, end: end), font: font, color: textColor, x: lineX + CGFloat(initial["widthPt"] as? Double ?? 44), baselineY: baseline, in: context)
        } else {
          drawAlbumTextAtBaseline(text: slice, font: font, color: textColor, x: lineX, baselineY: baseline, in: context)
        }
      }
    } else {
      let text = (block["text"] as? String)
        ?? (block["label"] as? String)
        ?? (block["value"] as? String)
        ?? (kind == "source-gone" ? copy["sourceGone"] : nil)
        ?? (kind == "source-unreadable" ? copy["sourceUnreadable"] : nil)
        ?? (kind == "source-changed" ? copy["sourceChanged"] : nil)
        ?? ""
      drawAlbumTextAtBaseline(
        text: text,
        font: font,
        color: textColor,
        x: x,
        baselineY: y + font.ascender,
        in: context
      )
    }
  }
}

final class AlbumPageView: ExpoView {
  var pageJson = "" {
    didSet { setNeedsDisplay() }
  }
  var mediaJson = "" {
    didSet { setNeedsDisplay() }
  }
  var playingJson = "[]" {
    didSet {
      DispatchQueue.main.async { [weak self] in
        self?.setNeedsDisplay()
      }
    }
  }
  /// Optional on-screen scale of this 420pt page. Thumbnails draw near their
  /// displayed pixel size instead of full size and then being minified.
  /// Geometry and drawing are unchanged; 0 keeps the screen scale.
  var renderScale: Double = 0 {
    didSet {
      guard renderScale != oldValue else { return }
      let screen = window?.screen.scale ?? UIScreen.main.scale
      contentScaleFactor = renderScale > 0 ? max(1, min(screen, screen * CGFloat(renderScale))) : screen
      setNeedsDisplay()
    }
  }

  required init(appContext: AppContext?) {
    super.init(appContext: appContext)
    isOpaque = true
    isUserInteractionEnabled = false
    isAccessibilityElement = false
    backgroundColor = albumPaperColor()
    contentMode = .redraw
  }

  override func draw(_ rect: CGRect) {
    guard let context = UIGraphicsGetCurrentContext() else { return }
    guard
      let data = pageJson.data(using: .utf8),
      let page = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      albumPaperColor().setFill()
      context.fill(rect)
      return
    }
    let playing: [String]
    if let playingData = playingJson.data(using: .utf8),
       let parsed = try? JSONSerialization.jsonObject(with: playingData) as? [String] {
      playing = parsed
    } else {
      playing = []
    }
    drawAlbumPage(page: page, media: parseAlbumMedia(mediaJson), playing: playing, in: context, bounds: bounds)
  }
}


/// Offline, read-only publication surface. It never presents a share controller.
final class AlbumEpubView: ExpoView, WKNavigationDelegate {
  let onReady = EventDispatcher()
  let onFailure = EventDispatcher()
  let onPageTurn = EventDispatcher()
  var rootUri = "" { didSet { setNeedsLayout() } }
  var documentUri = "" { didSet { setNeedsLayout() } }
  private let reader: WKWebView
  private var loaded = ""
  private var background: NSObjectProtocol?
  required init(appContext: AppContext?) {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    // Reading must not expose an implicit Save Image / Share menu.
    let noCallout = "document.addEventListener('contextmenu',function(e){e.preventDefault();});var s=document.createElement('style');s.textContent='*{-webkit-touch-callout:none}';document.documentElement.appendChild(s);"
    configuration.userContentController.addUserScript(WKUserScript(source:noCallout,injectionTime:.atDocumentEnd,forMainFrameOnly:true))
    configuration.allowsInlineMediaPlayback = true
    configuration.mediaTypesRequiringUserActionForPlayback = .all
    reader = WKWebView(frame: .zero, configuration: configuration)
    super.init(appContext: appContext)
    backgroundColor = UIColor(red:21/255.0,green:28/255.0,blue:25/255.0,alpha:1)
    reader.isOpaque = false; reader.backgroundColor = backgroundColor
    reader.scrollView.bounces = false; reader.allowsLinkPreview = false
    reader.navigationDelegate = self; addSubview(reader)
    for direction in [UISwipeGestureRecognizer.Direction.left, .right] {
      let gesture = UISwipeGestureRecognizer(target:self,action:#selector(swipe(_:)))
      gesture.direction = direction; gesture.cancelsTouchesInView = false
      reader.addGestureRecognizer(gesture)
    }
    background = NotificationCenter.default.addObserver(forName:UIApplication.didEnterBackgroundNotification,object:nil,queue:.main) { [weak self] _ in self?.clear() }
  }
  deinit {
    if let background = background { NotificationCenter.default.removeObserver(background) }
    reader.navigationDelegate = nil; reader.stopLoading()
  }
  override func layoutSubviews() {
    super.layoutSubviews()
    let width = min(bounds.width, bounds.height * 4 / 3)
    let height = width * 3 / 4
    reader.frame = CGRect(x:(bounds.width-width)/2,y:(bounds.height-height)/2,width:width,height:height)
    loadIfReady()
  }
  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil { clear() } else { setNeedsLayout() }
  }
  private func clear() {
    reader.pauseAllMediaPlayback(completionHandler:nil)
    reader.stopLoading(); loaded = ""
    reader.loadHTMLString("",baseURL:nil)
  }
  private func root() -> URL? {
    guard let url = try? printLocalURL(rootUri), url.lastPathComponent.hasPrefix("preview_"),
          url.deletingLastPathComponent().lastPathComponent == "album-epub-preview" else { return nil }
    return url
  }
  private func loadIfReady() {
    guard window != nil, UIApplication.shared.applicationState == .active,
          reader.bounds.width > 0, reader.bounds.height > 0, !documentUri.isEmpty, !rootUri.isEmpty,
          documentUri != loaded else { return }
    guard let directory = root(), let url = try? printLocalURL(documentUri),
          url.path.hasPrefix(directory.path + "/OEBPS/"), url.pathExtension == "xhtml" else {
      onFailure(["code":"PREVIEW_UNAVAILABLE"]); return
    }
    loaded = documentUri
    reader.loadFileURL(url,allowingReadAccessTo:directory)
  }
  @objc private func swipe(_ gesture: UISwipeGestureRecognizer) {
    guard reader.scrollView.zoomScale <= reader.scrollView.minimumZoomScale + 0.02 else { return }
    reader.evaluateJavaScript("!!document.querySelector('.photo-detail.is-open')") { [weak self] value, _ in
      guard let self = self, value as? Bool != true else { return }
      self.onPageTurn(["direction":gesture.direction == .left ? 1 : -1])
    }
  }
  func webView(_ webView:WKWebView,decidePolicyFor action:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void) {
    guard let url = action.request.url else { decisionHandler(.cancel); return }
    if url.absoluteString == "about:blank" { decisionHandler(.allow); return }
    guard let directory = root(), url.isFileURL, url.standardizedFileURL.path.hasPrefix(directory.path + "/OEBPS/") else { decisionHandler(.cancel); return }
    decisionHandler(.allow)
  }
  func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!) {
    guard webView.url?.isFileURL == true, !loaded.isEmpty else { return }
    onReady([:])
  }
  func webView(_ webView:WKWebView,didFail navigation:WKNavigation!,withError error:Error) { if !loaded.isEmpty { onFailure(["code":"PREVIEW_UNAVAILABLE"]) } }
  func webView(_ webView:WKWebView,didFailProvisionalNavigation navigation:WKNavigation!,withError error:Error) { if !loaded.isEmpty { onFailure(["code":"PREVIEW_UNAVAILABLE"]) } }
  func webViewWebContentProcessDidTerminate(_ webView:WKWebView) { if !loaded.isEmpty { onFailure(["code":"PREVIEW_UNAVAILABLE"]) } }
}
