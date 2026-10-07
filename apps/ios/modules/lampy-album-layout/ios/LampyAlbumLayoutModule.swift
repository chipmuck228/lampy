import CoreText
import ExpoModulesCore
import UIKit

public final class LampyAlbumLayoutModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LampyAlbumLayout")

    Function("measureText") { (text: String, fontName: String, sizePt: Double, lineHeightPt: Double, widthPt: Double) -> [[String: Double]] in
      measureText(text: text, fontName: fontName, sizePt: sizePt, lineHeightPt: lineHeightPt, widthPt: widthPt)
    }

    Function("diagnoseFonts") { () -> [String: Any] in
      diagnoseAlbumFonts()
    }

    AsyncFunction("writeProbePdf") { (layoutJson: String, mediaJson: String, destPath: String) -> [String: Any] in
      try writeProbePdf(layoutJson: layoutJson, mediaJson: mediaJson, destPath: destPath)
    }

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
  var candidates: [String] = [name]
  if isPingFang {
    candidates += [
      "PingFangSC-Regular",
      "PingFang SC",
      "PingFangSC-Light",
      "PingFangSC-Medium",
    ]
    candidates += UIFont.fontNames(forFamilyName: "PingFang SC")
  } else {
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
      let matched =
        family.localizedCaseInsensitiveContains(requestedFamily)
        || requestedFamily.localizedCaseInsensitiveContains(family)
        || (!isPingFang && (family.localizedCaseInsensitiveContains("Songti") || family.localizedCaseInsensitiveContains("STSong")))
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
  if !isPingFang {
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

private func resolveFont(name: String, size: CGFloat) -> UIFont {
  resolveAlbumFont(name: name, size: size).0
}

/// Dev-only probe samples. Fixed strings only — never caller body text.
private func diagnoseAlbumFonts() -> [String: Any] {
  let serif = resolveAlbumFont(name: "Songti SC", size: 17)
  let ui = resolveAlbumFont(name: "PingFang SC", size: 15)
  let cover = resolveAlbumFont(name: "Songti SC", size: 28)
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

private func coreTextRunFontNames(text: String, font: UIFont) -> [[String: String]] {
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
  let resolvedSerif = resolveAlbumFont(name: "Songti SC", size: 17).1
  let resolvedUi = resolveAlbumFont(name: "PingFang SC", size: 15).1
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

private func albumFontForKind(_ kind: String) -> (name: String, size: CGFloat, color: UIColor) {
  switch kind {
  case "cover-name":
    return ("Songti SC", 28, albumInkColor())
  case "note", "opening", "close":
    return ("Songti SC", 17, albumInkColor())
  case "day-rule":
    return ("PingFang SC", 15, albumSageColor())
  default:
    return ("PingFang SC", 15, albumInkSoftColor())
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

private func drawAlbumPage(
  page: [String: Any],
  media: [String: String],
  playing: [String],
  in context: CGContext,
  bounds: CGRect
) {
  albumPaperColor().setFill()
  context.fill(bounds)
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
        image.draw(in: CGRect(x: x, y: y, width: width, height: height))
      } else {
        UIColor(white: 0.9, alpha: 1).setFill()
        context.fill(CGRect(x: x, y: y, width: width, height: height))
        let missingFont = resolveFont(name: "PingFang SC", size: 15)
        drawAlbumTextAtBaseline(
          text: "这张照片现在看不到。",
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
      let value = block["value"] as? String ?? ""
      albumSageColor().setFill()
      context.fillEllipse(in: CGRect(x: x, y: y + 7, width: 8, height: 8))
      let spec = albumFontForKind(kind)
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
      let spec = albumFontForKind(kind)
      let font = resolveFont(name: spec.name, size: spec.size)
      let status = block["status"] as? String ?? ""
      if status == "available" {
        drawAudioGlyph(playing: playingAssets.contains(assetId), at: CGPoint(x: x, y: y + (height - 18) / 2))
      }
      let text = block["text"] as? String ?? ""
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
    let spec = albumFontForKind(kind)
    let font = resolveFont(name: spec.name, size: spec.size)
    if let lines = block["lines"] as? [[String: Any]], let text = block["text"] as? String, !lines.isEmpty {
      for line in lines {
        let start = Int(line["start"] as? Double ?? 0)
        let end = Int(line["end"] as? Double ?? 0)
        let lineX = CGFloat(line["xPt"] as? Double ?? x)
        let baseline = CGFloat(line["baselineYPt"] as? Double ?? Double(y) + Double(font.ascender))
        let slice = sliceAlbumScalars(text, start: start, end: end)
        drawAlbumTextAtBaseline(text: slice, font: font, color: spec.color, x: lineX, baselineY: baseline, in: context)
      }
    } else {
      let text = (block["text"] as? String)
        ?? (block["label"] as? String)
        ?? (block["value"] as? String)
        ?? ""
      drawAlbumTextAtBaseline(
        text: text,
        font: font,
        color: spec.color,
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


