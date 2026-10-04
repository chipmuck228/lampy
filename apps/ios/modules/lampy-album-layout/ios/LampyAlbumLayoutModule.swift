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
    let bounds = CTLineGetBoundsWithOptions(line, [.useGlyphPathBounds])
    let startScalar = map[min(utf16Start, map.count - 1)]
    let endScalar = map[min(utf16End, map.count - 1)]
    lines.append([
      "start": Double(startScalar),
      "end": Double(max(endScalar, startScalar)),
      "widthPt": Double(bounds.width),
      "heightPt": lineHeightPt,
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
  let media: [String: String]
  if let mediaData = mediaJson.data(using: .utf8),
     let parsed = try JSONSerialization.jsonObject(with: mediaData) as? [String: String] {
    media = parsed
  } else {
    media = [:]
  }
  let pageWidth = CGFloat((layout["pageSize"] as? [String: Any])?["widthPt"] as? Double ?? 420)
  let pageHeight = CGFloat((layout["pageSize"] as? [String: Any])?["heightPt"] as? Double ?? 595)
  let bounds = CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight)
  let renderer = UIGraphicsPDFRenderer(bounds: bounds)
  let data = renderer.pdfData { context in
    for page in pages {
      context.beginPage()
      UIColor(red: 0xf3 / 255, green: 0xf0 / 255, blue: 0xe9 / 255, alpha: 1).setFill()
      context.cgContext.fill(bounds)
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
          if let path = media[assetId], let image = UIImage(contentsOfFile: path.replacingOccurrences(of: "file://", with: "")) {
            image.draw(in: CGRect(x: x, y: y, width: width, height: height))
          } else {
            UIColor(white: 0.9, alpha: 1).setFill()
            context.cgContext.fill(CGRect(x: x, y: y, width: width, height: height))
          }
          continue
        }
        let fontName = (kind == "cover-name" || kind == "note" || kind == "opening" || kind == "close") ? "Songti SC" : "PingFang SC"
        let size = kind == "cover-name" ? 28.0 : kind == "note" || kind == "opening" || kind == "close" ? 17.0 : 15.0
        let font = resolveFont(name: fontName, size: CGFloat(size))
        if let lines = block["lines"] as? [[String: Any]], let text = block["text"] as? String, !lines.isEmpty {
          for line in lines {
            let start = Int(line["start"] as? Double ?? 0)
            let end = Int(line["end"] as? Double ?? 0)
            let lineX = CGFloat(line["xPt"] as? Double ?? x)
            let lineY = CGFloat(line["yPt"] as? Double ?? y)
            let slice = sliceScalars(text, start: start, end: end)
            (slice as NSString).draw(
              at: CGPoint(x: lineX, y: lineY),
              withAttributes: [.font: font, .foregroundColor: UIColor(red: 0x25 / 255, green: 0x23 / 255, blue: 0x1f / 255, alpha: 1)]
            )
          }
        } else {
          let text = (block["text"] as? String) ?? (block["label"] as? String) ?? (block["value"] as? String) ?? ""
          (text as NSString).draw(
            in: CGRect(x: x, y: y, width: width, height: height),
            withAttributes: [.font: font, .foregroundColor: UIColor(red: 0x25 / 255, green: 0x23 / 255, blue: 0x1f / 255, alpha: 1)]
          )
        }
      }
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

private func sliceScalars(_ text: String, start: Int, end: Int) -> String {
  let scalars = Array(text.unicodeScalars)
  let lo = max(0, min(start, scalars.count))
  let hi = max(lo, min(end, scalars.count))
  return String(String.UnicodeScalarView(scalars[lo..<hi]))
}
