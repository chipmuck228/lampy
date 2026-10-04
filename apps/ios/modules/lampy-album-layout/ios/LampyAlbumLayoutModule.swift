import CoreText
import ExpoModulesCore
import UIKit

public final class LampyAlbumLayoutModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LampyAlbumLayout")

    Function("measureText") { (text: String, fontName: String, sizePt: Double, lineHeightPt: Double, widthPt: Double) -> [[String: Double]] in
      measureText(text: text, fontName: fontName, sizePt: sizePt, lineHeightPt: lineHeightPt, widthPt: widthPt)
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
    }
  }
}

private func resolveFont(name: String, size: CGFloat) -> UIFont {
  if let named = UIFont(name: name, size: size) {
    return named
  }
  let fallbacks = name.contains("PingFang")
    ? ["PingFangSC-Regular", "PingFang SC"]
    : ["Songti SC", "STSong", "SongtiSC-Regular"]
  for fallback in fallbacks {
    if let font = UIFont(name: fallback, size: size) {
      return font
    }
  }
  return UIFont.systemFont(ofSize: size)
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
      drawAlbumPage(page: page, media: media, in: context.cgContext, bounds: bounds)
    }
  }
  let url = URL(fileURLWithPath: destPath)
  try data.write(to: url, options: .atomic)
  return [
    "path": destPath,
    "pageCount": pages.count,
    "bytes": data.count,
    "fontsEmbedded": false,
    "fontNames": ["Songti SC", "PingFang SC"],
  ]
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
  context.textPosition = CGPoint(x: x, y: -baselineY)
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

private func drawAlbumPage(page: [String: Any], media: [String: String], in context: CGContext, bounds: CGRect) {
  albumPaperColor().setFill()
  context.fill(bounds)
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

  required init(appContext: AppContext?) {
    super.init(appContext: appContext)
    isOpaque = true
    isUserInteractionEnabled = false
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
    drawAlbumPage(page: page, media: parseAlbumMedia(mediaJson), in: context, bounds: bounds)
  }
}


