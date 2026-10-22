import Foundation
import CoreGraphics
import ExpoModulesCore
import ImageIO
import UniformTypeIdentifiers

private enum FamilyImageFailure: String, Error {
  case sourceTooLarge = "SOURCE_TOO_LARGE"
  case dimensions = "DIMENSIONS"
  case decode = "DECODE_FAILED"
  case render = "RENDER_FAILED"
  case encode = "ENCODE_FAILED"
  case outputTooLarge = "OUTPUT_TOO_LARGE"
}
private let familyImageQueue = DispatchQueue(label: "app.lampy.family-image-copy")

public final class LampyFamilyImagesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LampyFamilyImages")
    AsyncFunction("prepare") { (base64: String, mime: String) -> [String: Any] in
      do {
        return try autoreleasepool {
          // Source and upload limits are different. Never write the original.
          guard base64.utf8.count <= 44_739_244,
                let input = Data(base64Encoded: base64), input.count <= 32 * 1024 * 1024 else { throw FamilyImageFailure.sourceTooLarge }
          guard !input.isEmpty,
                let source = CGImageSourceCreateWithData(input as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) else { throw FamilyImageFailure.decode }
          let index = CGImageSourceGetPrimaryImageIndex(source)
          guard let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any],
                let w = properties[kCGImagePropertyPixelWidth] as? Int,
                let h = properties[kCGImagePropertyPixelHeight] as? Int,
                w > 0, h > 0, w <= 120_000_000 / h else { throw FamilyImageFailure.dimensions }
          let outputMime = mime == "image/png" ? "image/png" : "image/jpeg"
          // Bounded rendering covers 48MP HEIF without three full-size decoded images.
          // ImageIO applies EXIF and HEIF container transforms. Do not second-guess
          // its resulting dimensions with a manually swapped EXIF width/height.
          let scale = min(1.0, min(4608.0 / Double(max(w, h)), sqrt(16_000_000.0 / (Double(w) * Double(h)))))
          let edge = max(1, Int(floor(Double(max(w, h)) * scale)))
          let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: edge,
            kCGImageSourceShouldCacheImmediately: true
          ]
          guard let image = CGImageSourceCreateThumbnailAtIndex(source, index, options as CFDictionary) else { throw FamilyImageFailure.decode }
          guard image.width > 0, image.height > 0, image.width <= edge, image.height <= edge,
                image.width <= 16_100_000 / image.height,
                let color = CGColorSpace(name: CGColorSpace.sRGB),
                let context = CGContext(data: nil, width: image.width, height: image.height,
                  bitsPerComponent: 8, bytesPerRow: 0, space: color,
                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { throw FamilyImageFailure.render }
          context.draw(image, in: CGRect(x: 0, y: 0, width: CGFloat(image.width), height: CGFloat(image.height)))
          guard let rendered = context.makeImage() else { throw FamilyImageFailure.render }
          let type = outputMime == "image/png" ? UTType.png.identifier : UTType.jpeg.identifier
          let qualities: [Double] = outputMime == "image/png" ? [1.0] : [0.9, 0.8, 0.7, 0.6]
          for quality in qualities {
            // Each unsuccessful encoding buffer is released before the next attempt.
            let encoded: Data? = try autoreleasepool {
              let output = NSMutableData()
              guard let destination = CGImageDestinationCreateWithData(output as CFMutableData, type as CFString, 1, nil) else { throw FamilyImageFailure.encode }
              let encode: [CFString: Any] = outputMime == "image/jpeg" ? [kCGImageDestinationLossyCompressionQuality: quality] : [:]
              CGImageDestinationAddImage(destination, rendered, encode as CFDictionary)
              guard CGImageDestinationFinalize(destination) else { throw FamilyImageFailure.encode }
              return output.length <= 8 * 1024 * 1024 ? output as Data : nil
            }
            if let encoded = encoded {
              return ["base64": encoded.base64EncodedString(), "mimeType": outputMime,
                      "width": image.width, "height": image.height]
            }
          }
          throw FamilyImageFailure.outputTooLarge
        }
      } catch let failure as FamilyImageFailure {
        // Fixed stage codes only: never return paths, original EXIF or native error descriptions.
        return ["error": failure.rawValue]
      } catch { return ["error": FamilyImageFailure.encode.rawValue] }
    }.runOnQueue(familyImageQueue)
  }
}
