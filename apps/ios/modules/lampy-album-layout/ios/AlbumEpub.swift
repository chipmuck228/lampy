import Foundation
import ImageIO

/// Decode directly to a thumbnail; never instantiate a full-resolution UIImage.
func prepareEpubImage(_ source: String, _ destination: String) throws -> [String: Any] {
  try autoreleasepool {
    let input = try printLocalURL(source)
    let output = try printLocalURL(destination)
    guard let imageSource = CGImageSourceCreateWithURL(input as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
          let image = CGImageSourceCreateThumbnailAtIndex(imageSource, 0, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 2048,
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
