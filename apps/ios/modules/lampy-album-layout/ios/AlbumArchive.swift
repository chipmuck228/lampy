import Foundation
import CryptoKit
import UIKit
import AVFoundation
import ImageIO
import CoreGraphics

// Format 1 deliberately uses stored ZIP entries: bounded, streamable, no decompressor.
private let archiveMaxBytes: UInt64 = 512 * 1024 * 1024
private let archiveMaxFiles = 512
private let archiveChunk = 64 * 1024
private func archiveFailure(_ code: String) -> NSError {
  NSError(domain: "LampyAlbumArchive", code: 1, userInfo: [NSLocalizedDescriptionKey: code])
}
private func archiveRoot() throws -> URL {
  let root = FileManager.default.temporaryDirectory.appendingPathComponent("lampy-album-sessions", isDirectory: true)
  try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
  var values = URLResourceValues(); values.isExcludedFromBackup = true
  var mutable = root; try mutable.setResourceValues(values)
  return root
}
private func archiveSession(_ id: String) throws -> URL {
  guard id.range(of: "^[a-zA-Z0-9_-]{1,80}$", options: .regularExpression) != nil else { throw archiveFailure("FILE_INVALID") }
  return try archiveRoot().appendingPathComponent(id, isDirectory: true)
}
func cleanAlbumArchiveSessions() throws {
  let root = try archiveRoot()
  for url in try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) {
    try FileManager.default.removeItem(at: url)
  }
}
private func archiveValidateMedia(_ folder: URL, _ names: Set<String>) throws {
  for name in names {
    let url = folder.appendingPathComponent(name)
    if name.hasSuffix(".png") {
      guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
            CGImageSourceGetType(source) as String? == "public.png",
            let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
            let width = props[kCGImagePropertyPixelWidth] as? Int, let height = props[kCGImagePropertyPixelHeight] as? Int,
            width > 0, height > 0, width <= 16000, height <= 16000, width * height <= 40_000_000 else { throw archiveFailure("FILE_MEDIA_INVALID") }
    } else if name.hasSuffix(".m4a") {
      let asset = AVURLAsset(url: url)
      guard !asset.tracks(withMediaType: .audio).isEmpty, asset.duration.seconds.isFinite,
            asset.duration.seconds > 0, asset.duration.seconds <= 86400 else { throw archiveFailure("FILE_MEDIA_INVALID") }
    } else if name == "album.pdf" {
      guard let pdf = CGPDFDocument(url as CFURL), pdf.numberOfPages > 0, pdf.numberOfPages <= 2000,
            let catalog = pdf.catalog else { throw archiveFailure("FILE_MEDIA_INVALID") }
      var action: CGPDFObjectRef?
      guard !CGPDFDictionaryGetObject(catalog, "OpenAction", &action), !CGPDFDictionaryGetObject(catalog, "AA", &action) else { throw archiveFailure("FILE_INVALID") }
      var named: CGPDFDictionaryRef?
      if CGPDFDictionaryGetDictionary(catalog, "Names", &named), let named = named,
         CGPDFDictionaryGetObject(named, "JavaScript", &action) { throw archiveFailure("FILE_INVALID") }
    }
  }
}
func closeAlbumArchive(_ id: String) throws {
  let url = try archiveSession(id)
  if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
}
func beginAlbumArchive(_ id: String) throws -> String {
  let url = try archiveSession(id)
  guard !FileManager.default.fileExists(atPath: url.path) else { throw archiveFailure("FILE_BUSY") }
  try FileManager.default.createDirectory(at: url, withIntermediateDirectories: false)
  return url.absoluteString
}
private func archiveName(_ name: String) -> Bool {
  name == "book.json" || name == "album.pdf" || name.range(of: "^media-[0-9]{1,4}\\.(png|m4a)$", options: .regularExpression) != nil
}
private let archiveCRCTable: [UInt32] = (0..<256).map { index in
  var value = UInt32(index)
  for _ in 0..<8 { value = (value >> 1) ^ (value & 1 == 1 ? 0xedb88320 : 0) }
  return value
}
private func archiveCRC(_ crc: UInt32, _ data: Data) -> UInt32 {
  var value = crc
  for byte in data {
    value = archiveCRCTable[Int((value ^ UInt32(byte)) & 0xff)] ^ (value >> 8)
  }
  return value
}
private func archiveJoin(_ parts: [Data]) -> Data { var result = Data(); for part in parts { result.append(part) }; return result }
private func archiveU16(_ value: UInt16) -> Data { var value = value.littleEndian; return withUnsafeBytes(of: &value) { Data($0) } }
private func archiveU32(_ value: UInt32) -> Data { var value = value.littleEndian; return withUnsafeBytes(of: &value) { Data($0) } }
private func archiveRead(_ file: FileHandle, _ count: Int) throws -> Data {
  let data = try file.read(upToCount: count) ?? Data()
  guard data.count == count else { throw archiveFailure("FILE_INVALID") }; return data
}
private func archiveNumber(_ data: Data, _ offset: Int, _ count: Int) -> UInt32 {
  var value: UInt32 = 0
  for index in 0..<count { value |= UInt32(data[offset + index]) << UInt32(index * 8) }
  return value
}
private func archiveStats(_ url: URL) throws -> (UInt32, UInt32) {
  let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
  var size: UInt64 = 0; var crc: UInt32 = 0xffffffff
  while true {
    let data = try handle.read(upToCount: archiveChunk) ?? Data(); if data.isEmpty { break }
    size += UInt64(data.count); guard size <= archiveMaxBytes else { throw archiveFailure("FILE_TOO_LARGE") }
    crc = archiveCRC(crc, data)
  }
  return (UInt32(size), crc ^ 0xffffffff)
}
func prepareAlbumArchiveMedia(_ id: String, _ source: String, _ name: String, _ role: String) async throws -> [String: Any] {
  guard archiveName(name), name.hasPrefix("media-") else { throw archiveFailure("FILE_INVALID") }
  let destination = try archiveSession(id).appendingPathComponent(name)
  guard !FileManager.default.fileExists(atPath: destination.path) else { throw archiveFailure("FILE_INVALID") }
  let input = try printLocalURL(source)
  if role == "image" {
    guard name.hasSuffix(".png"), let source = CGImageSourceCreateWithURL(input as CFURL, nil), CGImageSourceGetCount(source) == 1,
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int, let height = properties[kCGImagePropertyPixelHeight] as? Int,
          width > 0, height > 0, width <= 16000, height <= 16000, width * height <= 40_000_000,
          let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: max(width, height)
          ] as CFDictionary),
          let output = CGImageDestinationCreateWithURL(destination as CFURL, "public.png" as CFString, 1, nil) else { throw archiveFailure("FILE_MEDIA_INVALID") }
    CGImageDestinationAddImage(output, image, nil)
    guard CGImageDestinationFinalize(output) else { throw archiveFailure("FILE_MEDIA_INVALID") }
  } else if role == "audio" {
    guard !name.hasSuffix(".png") else { throw archiveFailure("FILE_MEDIA_INVALID") }
    // Remux audio into m4a to avoid forwarding tags/location from source containers.
    let asset = AVURLAsset(url: input)
    guard name.hasSuffix(".m4a"), asset.duration.seconds.isFinite, asset.duration.seconds > 0, asset.duration.seconds <= 86400,
          let exporter = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else { throw archiveFailure("FILE_MEDIA_INVALID") }
    exporter.outputURL = destination; exporter.outputFileType = .m4a; exporter.metadata = []
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      exporter.exportAsynchronously { continuation.resume() }
    }
    guard exporter.status == .completed else { throw archiveFailure("FILE_MEDIA_INVALID") }
  } else { throw archiveFailure("FILE_MEDIA_INVALID") }
  var result = try printFileDigest(destination.absoluteString)
  if role == "image", let image = CGImageSourceCreateWithURL(destination as CFURL, nil),
     let props = CGImageSourceCopyPropertiesAtIndex(image, 0, nil) as? [CFString: Any] {
    result["widthPx"] = props[kCGImagePropertyPixelWidth]; result["heightPx"] = props[kCGImagePropertyPixelHeight]
  }
  return result
}
func packAlbumArchive(_ id: String) throws -> [String: Any] {
  let folder = try archiveSession(id)
  let files = try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil).sorted { $0.lastPathComponent < $1.lastPathComponent }
  guard files.count >= 2, files.count <= archiveMaxFiles,
        files.contains(where: { $0.lastPathComponent == "book.json" }), files.contains(where: { $0.lastPathComponent == "album.pdf" }),
        files.allSatisfy({ archiveName($0.lastPathComponent) }) else { throw archiveFailure("FILE_INVALID") }
  var total: UInt64 = 0
  let stats = try files.map { url -> (UInt32, UInt32) in let stat = try archiveStats(url); total += UInt64(stat.0); return stat }
  let available = try folder.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage ?? 0
  guard total + UInt64(files.count * 200 + 22) <= archiveMaxBytes else { throw archiveFailure("FILE_TOO_LARGE") }
  guard available > Int64(total * 2 + 16 * 1024 * 1024) else { throw archiveFailure("FILE_NO_SPACE") }
  let bookData = try Data(contentsOf: folder.appendingPathComponent("book.json"))
  guard bookData.count <= 4 * 1024 * 1024,
        let book = try JSONSerialization.jsonObject(with: bookData) as? [String: Any] else { throw archiveFailure("FILE_INVALID") }
  let forbidden = CharacterSet.controlCharacters.union(CharacterSet(charactersIn: "/\\:*?\"<>|"))
  let title = (book["name"] as? String ?? "Life album").unicodeScalars.map { forbidden.contains($0) ? "-" : String($0) }.joined()
  let stem = String(title.prefix(80)).trimmingCharacters(in: .whitespacesAndNewlines.union(CharacterSet(charactersIn: ".")))
  let target = folder.appendingPathComponent((stem.isEmpty ? "Life album" : stem) + ".lampy")
  guard FileManager.default.createFile(atPath: target.path, contents: nil) else { throw archiveFailure("FILE_NO_SPACE") }
  let output = try FileHandle(forWritingTo: target); defer { try? output.close() }
  var central = Data(); var offset: UInt32 = 0
  for (index, url) in files.enumerated() {
    let name = Data(url.lastPathComponent.utf8); let (size, crc) = stats[index]
    let header = archiveJoin([archiveU32(0x04034b50), archiveU16(20), archiveU16(0), archiveU16(0), archiveU16(0), archiveU16(0), archiveU32(crc), archiveU32(size), archiveU32(size), archiveU16(UInt16(name.count)), archiveU16(0), name])
    try output.write(contentsOf: header)
    let input = try FileHandle(forReadingFrom: url)
    do { while true { let data = try input.read(upToCount: archiveChunk) ?? Data(); if data.isEmpty { break }; try output.write(contentsOf: data) }; try input.close() }
    catch { try? input.close(); throw error }
    central.append(archiveJoin([archiveU32(0x02014b50), archiveU16(20), archiveU16(20), archiveU16(0), archiveU16(0), archiveU16(0), archiveU16(0), archiveU32(crc), archiveU32(size), archiveU32(size), archiveU16(UInt16(name.count)), archiveU16(0), archiveU16(0), archiveU16(0), archiveU16(0), archiveU32(0), archiveU32(offset), name]))
    offset += UInt32(header.count) + size
  }
  try output.write(contentsOf: central)
  try output.write(contentsOf: archiveJoin([archiveU32(0x06054b50), archiveU16(0), archiveU16(0), archiveU16(UInt16(files.count)), archiveU16(UInt16(files.count)), archiveU32(UInt32(central.count)), archiveU32(offset), archiveU16(0)]))
  try output.synchronize()
  let verification = "verify_" + UUID().uuidString
  do {
    _ = try unpackAlbumArchive(target, verification)
    try closeAlbumArchive(verification)
  } catch { try? closeAlbumArchive(verification); throw error }
  var digest = try printFileDigest(target.absoluteString)
  digest["uri"] = target.absoluteString
  return digest
}
func openAlbumArchive(_ source: String, _ id: String) throws -> [String: Any] {
  let original = try printLocalURL(source)
  let scoped = original.startAccessingSecurityScopedResource(); defer { if scoped { original.stopAccessingSecurityScopedResource() } }
  var result: [String: Any]?
  var failure: Error?
  var coordinationError: NSError?
  NSFileCoordinator(filePresenter: nil).coordinate(readingItemAt: original, options: .withoutChanges, error: &coordinationError) { url in
    do { result = try unpackAlbumArchive(url, id) } catch { failure = error }
  }
  if let error = coordinationError { throw error }; if let error = failure { throw error }
  guard let result = result else { throw archiveFailure("FILE_INVALID") }; return result
}
private func unpackAlbumArchive(_ source: URL, _ id: String) throws -> [String: Any] {
  let file = try FileHandle(forReadingFrom: source); defer { try? file.close() }
  let size = try file.seekToEnd(); guard size >= 22, size <= archiveMaxBytes else { throw archiveFailure("FILE_TOO_LARGE") }
  try file.seek(toOffset: size - 22); let end = try archiveRead(file, 22)
  guard archiveNumber(end, 0, 4) == 0x06054b50, archiveNumber(end, 4, 2) == 0, archiveNumber(end, 6, 2) == 0,
        archiveNumber(end, 8, 2) == archiveNumber(end, 10, 2), archiveNumber(end, 20, 2) == 0 else { throw archiveFailure("FILE_INVALID") }
  let count = Int(archiveNumber(end, 10, 2)), centralSize = UInt64(archiveNumber(end, 12, 4)), centralOffset = UInt64(archiveNumber(end, 16, 4))
  guard count >= 2, count <= archiveMaxFiles, centralSize <= UInt64(archiveMaxFiles * 200), centralOffset + centralSize == size - 22 else { throw archiveFailure("FILE_INVALID") }
  try file.seek(toOffset: centralOffset)
  var records: [(String, UInt32, UInt32, UInt64)] = []; var names = Set<String>(); var total: UInt64 = 0
  for _ in 0..<count {
    let header = try archiveRead(file, 46); let length = Int(archiveNumber(header, 28, 2))
    guard archiveNumber(header, 0, 4) == 0x02014b50, archiveNumber(header, 8, 2) == 0, archiveNumber(header, 10, 2) == 0,
          archiveNumber(header, 20, 4) == archiveNumber(header, 24, 4), archiveNumber(header, 30, 2) == 0,
          archiveNumber(header, 32, 2) == 0, archiveNumber(header, 34, 2) == 0, archiveNumber(header, 38, 4) == 0,
          length > 0, length <= 80 else { throw archiveFailure("FILE_INVALID") }
    let nameData = try archiveRead(file, length)
    guard let name = String(data: nameData, encoding: .utf8), archiveName(name), names.insert(name).inserted else { throw archiveFailure("FILE_INVALID") }
    let bytes = archiveNumber(header, 24, 4)
    guard name != "book.json" || bytes <= 4 * 1024 * 1024 else { throw archiveFailure("FILE_TOO_LARGE") }
    total += UInt64(bytes); records.append((name, bytes, archiveNumber(header, 16, 4), UInt64(archiveNumber(header, 42, 4))))
  }
  guard try file.offset() == size - 22, total <= archiveMaxBytes, names.contains("book.json"), names.contains("album.pdf") else { throw archiveFailure("FILE_INVALID") }
  let root = try archiveRoot(); let available = try root.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage ?? 0
  guard available > Int64(total + 16 * 1024 * 1024) else { throw archiveFailure("FILE_NO_SPACE") }
  _ = try beginAlbumArchive(id); let destination = try archiveSession(id)
  do {
    var nextOffset: UInt64 = 0
    for (name, bytes, crc, offset) in records.sorted(by: { $0.3 < $1.3 }) {
      guard offset == nextOffset else { throw archiveFailure("FILE_INVALID") }
      try file.seek(toOffset: offset); let header = try archiveRead(file, 30)
      let length = Int(archiveNumber(header, 26, 2))
      guard archiveNumber(header, 0, 4) == 0x04034b50, archiveNumber(header, 6, 2) == 0, archiveNumber(header, 8, 2) == 0,
            archiveNumber(header, 14, 4) == crc, archiveNumber(header, 18, 4) == bytes, archiveNumber(header, 22, 4) == bytes,
            archiveNumber(header, 28, 2) == 0, length == name.utf8.count,
            offset + UInt64(30 + length) + UInt64(bytes) <= centralOffset else { throw archiveFailure("FILE_INVALID") }
      guard try archiveRead(file, length) == Data(name.utf8) else { throw archiveFailure("FILE_INVALID") }
      let url = destination.appendingPathComponent(name)
      guard FileManager.default.createFile(atPath: url.path, contents: nil) else { throw archiveFailure("FILE_NO_SPACE") }
      let output = try FileHandle(forWritingTo: url); var remaining = Int(bytes); var actual: UInt32 = 0xffffffff
      do { while remaining > 0 { let chunk = try archiveRead(file, min(remaining, archiveChunk)); actual = archiveCRC(actual, chunk); try output.write(contentsOf: chunk); remaining -= chunk.count }; try output.close() }
      catch { try? output.close(); throw error }
      guard actual ^ 0xffffffff == crc else { throw archiveFailure("FILE_INVALID") }
      nextOffset = offset + UInt64(30 + length) + UInt64(bytes)
    }
    guard nextOffset == centralOffset else { throw archiveFailure("FILE_INVALID") }
    try archiveValidateMedia(destination, names)
    let manifest = try String(contentsOf: destination.appendingPathComponent("book.json"), encoding: .utf8)
    var hashes: [String: String] = [:]
    for (name, _, _, _) in records where name != "book.json" { hashes[name] = try printFileDigest(destination.appendingPathComponent(name).absoluteString)["sha256"] as? String }
    return ["directory": destination.absoluteString, "manifest": manifest, "hashes": hashes]
  } catch { try? closeAlbumArchive(id); throw error }
}

// Retain delegates until the system confirms export or cancellation.
private var archiveSaveDelegates: [UUID: ArchiveSaveDelegate] = [:]
private final class ArchiveSaveDelegate: NSObject, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
  let id: UUID
  private var finished = false
  let completion: (Bool) -> Void
  init(id: UUID, completion: @escaping (Bool) -> Void) { self.id = id; self.completion = completion }
  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { finish(!urls.isEmpty) }
  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { finish(false) }
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { finish(false) }
  private func finish(_ saved: Bool) { guard !finished else { return }; finished = true; completion(saved); archiveSaveDelegates.removeValue(forKey: id) }
}
func saveAlbumArchive(_ source: String, completion: @escaping (Result<Bool, Error>) -> Void) {
  DispatchQueue.main.async {
    do {
      let url = try printLocalURL(source)
      guard UIApplication.shared.applicationState == .active, FileManager.default.fileExists(atPath: url.path),
        var controller = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).flatMap({ $0.windows }).first(where: { $0.isKeyWindow })?.rootViewController else { throw archiveFailure("FILE_SAVE_FAILED") }
      while let presented = controller.presentedViewController { controller = presented }
      let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
      let id = UUID(); let delegate = ArchiveSaveDelegate(id: id) { completion(.success($0)) }
      archiveSaveDelegates[id] = delegate; picker.delegate = delegate; picker.presentationController?.delegate = delegate
      controller.present(picker, animated: true)
    } catch { completion(.failure(error)) }
  }
}
