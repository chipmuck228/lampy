import Foundation
import ImageIO
import CoreGraphics

/// Decode directly to a thumbnail; never instantiate a full-resolution UIImage.
func prepareEpubImage(_ source: String, _ destination: String) throws -> [String: Any] {
  try autoreleasepool {
    let input = try printLocalURL(source)
    let output = try printLocalURL(destination)
    guard let imageSource = CGImageSourceCreateWithURL(input as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
          let properties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil) as? [CFString: Any],
          let sourceWidth = properties[kCGImagePropertyPixelWidth] as? NSNumber,
          let sourceHeight = properties[kCGImagePropertyPixelHeight] as? NSNumber,
          sourceWidth.intValue > 0, sourceHeight.intValue > 0 else {
      throw NSError(domain: "LampyEpub", code: 1, userInfo: [NSLocalizedDescriptionKey: "EPUB_IMAGE_UNREADABLE"])
    }
    // Never enlarge a small source before the publication can apply its size limit.
    let maximum = min(1600, max(sourceWidth.intValue, sourceHeight.intValue))
    guard let image = CGImageSourceCreateThumbnailAtIndex(imageSource, 0, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maximum,
            kCGImageSourceShouldCacheImmediately: true
          ] as CFDictionary) else {
      throw NSError(domain: "LampyEpub", code: 1, userInfo: [NSLocalizedDescriptionKey: "EPUB_IMAGE_UNREADABLE"])
    }
    let png = (CGImageSourceGetType(imageSource) as String?) == "public.png"
    let type = png ? "public.png" : "public.jpeg"
    guard let writer = CGImageDestinationCreateWithURL(output as CFURL, type as CFString, 1, nil) else {
      throw NSError(domain: "LampyEpub", code: 2, userInfo: [NSLocalizedDescriptionKey: "EPUB_IMAGE_WRITE_FAILED"])
    }
    CGImageDestinationAddImage(writer, image, [kCGImageDestinationLossyCompressionQuality: 0.82] as CFDictionary)
    guard CGImageDestinationFinalize(writer) else {
      try? FileManager.default.removeItem(at: output)
      throw NSError(domain: "LampyEpub", code: 3, userInfo: [NSLocalizedDescriptionKey: "EPUB_IMAGE_WRITE_FAILED"])
    }
    let info = try FileManager.default.attributesOfItem(atPath: output.path)
    return ["mime": png ? "image/png" : "image/jpeg", "extension": png ? "png" : "jpg",
            "bytes": (info[.size] as? NSNumber)?.intValue ?? 0, "width": image.width, "height": image.height]
  }
}

/// A bounded, orientation-normalised JPEG derivative for print. Frozen originals stay untouched.
func preparePrintImage(_ source: String, _ destination: String) throws -> [String: Any] {
  try autoreleasepool {
    let input = try printLocalURL(source), output = try printLocalURL(destination)
    guard let imageSource = CGImageSourceCreateWithURL(input as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
          let properties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil) as? [CFString: Any],
          let w = properties[kCGImagePropertyPixelWidth] as? NSNumber,
          let h = properties[kCGImagePropertyPixelHeight] as? NSNumber, w.intValue > 0, h.intValue > 0,
          let thumbnail = CGImageSourceCreateThumbnailAtIndex(imageSource, 0, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: min(1600, max(w.intValue, h.intValue)),
            kCGImageSourceShouldCacheImmediately: true
          ] as CFDictionary),
          let bitmap = CGContext(data: nil, width: thumbnail.width, height: thumbnail.height, bitsPerComponent: 8, bytesPerRow: 0,
                                 space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else {
      throw NSError(domain: "LampyPrint", code: 1, userInfo: [NSLocalizedDescriptionKey: "IMAGE_UNREADABLE"])
    }
    bitmap.setFillColor(CGColor(red: 250.0/255.0, green: 249.0/255.0, blue: 245.0/255.0, alpha: 1))
    let rect = CGRect(x: 0, y: 0, width: CGFloat(thumbnail.width), height: CGFloat(thumbnail.height))
    bitmap.fill(rect); bitmap.draw(thumbnail, in: rect)
    guard let opaque = bitmap.makeImage(), let writer = CGImageDestinationCreateWithURL(output as CFURL, "public.jpeg" as CFString, 1, nil) else {
      throw NSError(domain: "LampyPrint", code: 2, userInfo: [NSLocalizedDescriptionKey: "PDF_CREATE_FAILED"])
    }
    CGImageDestinationAddImage(writer, opaque, [kCGImageDestinationLossyCompressionQuality: 0.82] as CFDictionary)
    guard CGImageDestinationFinalize(writer) else {
      try? FileManager.default.removeItem(at: output)
      throw NSError(domain: "LampyPrint", code: 3, userInfo: [NSLocalizedDescriptionKey: "PDF_CREATE_FAILED"])
    }
    let info = try FileManager.default.attributesOfItem(atPath: output.path)
    return ["width": opaque.width, "height": opaque.height, "bytes": (info[.size] as? NSNumber)?.intValue ?? 0]
  }
}
