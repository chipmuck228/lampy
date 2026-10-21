import Foundation
import CoreGraphics
import ExpoModulesCore
import ImageIO
import UniformTypeIdentifiers

private enum FamilyImageFailure: Error { case invalid, tooLarge, render, encode }
private let familyImageQueue = DispatchQueue(label: "app.lampy.family-image-copy")

public final class LampyFamilyImagesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LampyFamilyImages")
    AsyncFunction("prepare") { (base64: String, mime: String) -> [String: Any] in
      try autoreleasepool {
        // No paths accepted, no source file written. Bound bytes/pixels before decode.
        guard base64.utf8.count <= 11_184_812,
              let input = Data(base64Encoded: base64), !input.isEmpty, input.count <= 8 * 1024 * 1024,
              let source = CGImageSourceCreateWithData(input as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let w = properties[kCGImagePropertyPixelWidth] as? Int,
              let h = properties[kCGImagePropertyPixelHeight] as? Int,
              w > 0, h > 0, w <= 40_000_000 / h else { throw FamilyImageFailure.invalid }
        let outputMime = mime == "image/png" ? "image/png" : "image/jpeg"
        let orientation = (properties[kCGImagePropertyOrientation] as? Int) ?? 1
        let swapsAxes = [5, 6, 7, 8].contains(orientation)
        let options: [CFString: Any] = [
          kCGImageSourceCreateThumbnailFromImageAlways: true,
          kCGImageSourceCreateThumbnailWithTransform: true,
          kCGImageSourceThumbnailMaxPixelSize: max(w, h),
          kCGImageSourceShouldCacheImmediately: true
        ]
        // Full-size rendered pixels, never an embedded thumbnail or source EXIF tree.
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
              image.width == (swapsAxes ? h : w), image.height == (swapsAxes ? w : h),
              let color = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(data: nil, width: image.width, height: image.height,
                bitsPerComponent: 8, bytesPerRow: 0, space: color,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { throw FamilyImageFailure.render }
        context.draw(image, in: CGRect(x: 0, y: 0, width: CGFloat(image.width), height: CGFloat(image.height)))
        guard let rendered = context.makeImage() else { throw FamilyImageFailure.render }
        let output = NSMutableData()
        let type = outputMime == "image/png" ? UTType.png.identifier : UTType.jpeg.identifier
        guard let destination = CGImageDestinationCreateWithData(output as CFMutableData, type as CFString, 1, nil) else { throw FamilyImageFailure.encode }
        // Fresh destination: source metadata dictionaries are never passed through.
        let encode: [CFString: Any] = outputMime == "image/jpeg" ? [kCGImageDestinationLossyCompressionQuality: 0.9] : [:]
        CGImageDestinationAddImage(destination, rendered, encode as CFDictionary)
        guard CGImageDestinationFinalize(destination), output.length <= 8 * 1024 * 1024 else { throw FamilyImageFailure.tooLarge }
        return ["base64": (output as Data).base64EncodedString(), "mimeType": outputMime,
                "width": image.width, "height": image.height]
      }
    }.runOnQueue(familyImageQueue)
  }
}
