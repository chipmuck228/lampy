import ExpoModulesCore
import UIKit

#if canImport(FoundationModels)
import FoundationModels
#endif

public class LampyFoundationProbeModule: Module {
  private let lock = NSLock()
  private var generationTask: Task<Void, Never>?
  private var currentRequestId: String?

  /// Recorded from the machine that compiled this module. Runtime OS may be older.
  private static let compileSdkVersion = "26.5"
  private static let compileXcodeVersion = "26.6 (17F113)"

  public func definition() -> ModuleDefinition {
    Name("LampyFoundationProbe")

    AsyncFunction("inspect") { () async -> [String: Any] in
      await self.inspect()
    }

    AsyncFunction("selectQuotes") { (payload: [String: Any]) -> [String: Any] in
      let requestId = (payload["requestId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      if requestId.isEmpty {
        return [
          "status": "failed",
          "unavailableReason": "missingRequestId",
          "durationMs": 0,
          "promptCharsUsed": 0,
          "quotes": [],
        ]
      }
      if !self.tryBegin(requestId) {
        return [
          "status": "busy",
          "unavailableReason": "inFlight",
          "durationMs": 0,
          "promptCharsUsed": 0,
          "quotes": [],
        ]
      }
      return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[String: Any], Error>) in
        self.generationTask = Task {
          defer {
            self.endIfCurrent(requestId)
            self.generationTask = nil
          }
          do {
            let value = try await self.selectQuotes(payload: payload)
            continuation.resume(returning: value)
          } catch is CancellationError {
            continuation.resume(returning: [
              "status": "cancelled",
              "durationMs": 0,
              "promptCharsUsed": 0,
              "quotes": [],
            ])
          } catch {
            continuation.resume(throwing: error)
          }
        }
      }
    }

    Function("cancel") { (requestId: String) in
      self.cancelIfCurrent(requestId)
    }
  }

  private func tryBegin(_ requestId: String) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if currentRequestId != nil { return false }
    currentRequestId = requestId
    return true
  }

  private func endIfCurrent(_ requestId: String) {
    lock.lock()
    defer { lock.unlock() }
    if currentRequestId == requestId {
      currentRequestId = nil
    }
  }

  private func cancelIfCurrent(_ requestId: String) {
    lock.lock()
    let matches = currentRequestId == requestId
    lock.unlock()
    if matches {
      generationTask?.cancel()
    }
  }

  private func inspect() async -> [String: Any] {
    var result: [String: Any] = [
      "linked": true,
      "osName": UIDevice.current.systemName,
      "osVersion": UIDevice.current.systemVersion,
      "osMajor": ProcessInfo.processInfo.operatingSystemVersion.majorVersion,
      "deviceModel": Self.utsMachine(),
      "localeIdentifier": Locale.current.identifier,
      "preferredLanguages": Locale.preferredLanguages,
      "compileSdkVersion": Self.compileSdkVersion,
      "compileXcodeVersion": Self.compileXcodeVersion,
      "supportsLocaleCurrent": NSNull(),
      "supportsLocaleZhHans": NSNull(),
      "supportsLocaleZhCN": NSNull(),
      "supportsLocaleZhHant": NSNull(),
      "supportedLanguages": [],
      "supportedLanguagesIncludesChinese": NSNull(),
      "contextCapacityTokens": NSNull(),
      "tokenCountForProbePrompt": NSNull(),
    ]

    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      let model = SystemLanguageModel.default
      switch model.availability {
      case .available:
        result["availability"] = "available"
        result["unavailableReason"] = NSNull()
      case .unavailable(let reason):
        result["availability"] = "unavailable"
        result["unavailableReason"] = self.reasonName(reason)
      }

      let supportsCurrent = model.supportsLocale(Locale.current)
      let supportsZhHans = model.supportsLocale(Locale(identifier: "zh-Hans"))
      let supportsZhCN = model.supportsLocale(Locale(identifier: "zh-CN"))
      let supportsZhHant = model.supportsLocale(Locale(identifier: "zh-Hant"))
      result["supportsLocaleCurrent"] = supportsCurrent
      result["supportsLocaleZhHans"] = supportsZhHans
      result["supportsLocaleZhCN"] = supportsZhCN
      result["supportsLocaleZhHant"] = supportsZhHant

      let languages = model.supportedLanguages.map { $0.maximalIdentifier }.sorted()
      result["supportedLanguages"] = languages
      let includesChinese = languages.contains { $0.hasPrefix("zh") } || supportsZhHans || supportsZhCN
      result["supportedLanguagesIncludesChinese"] = includesChinese

      result["contextCapacityTokens"] = model.contextSize
      result["contextCapacityNote"] =
        "SystemLanguageModel.contextSize (tokens, prompt+response). @backDeployed(before: iOS 26.4) is 4096 on 26.0–26.3. Compile SDK iPhoneOS\(Self.compileSdkVersion)."

      if #available(iOS 26.4, *) {
        do {
          let count = try await model.tokenCount(for: "probe")
          result["tokenCountForProbePrompt"] = count
          result["tokenCountNote"] = "SystemLanguageModel.tokenCount(for:) iOS 26.4+"
        } catch {
          result["tokenCountForProbePrompt"] = NSNull()
          result["tokenCountNote"] = "tokenCount threw: \(error.localizedDescription)"
        }
      } else {
        result["tokenCountForProbePrompt"] = NSNull()
        result["tokenCountNote"] =
          "tokenCount(for:) requires iOS 26.4; compile SDK iPhoneOS\(Self.compileSdkVersion) has it; this OS is below 26.4"
      }
    } else {
      result["availability"] = "unavailable"
      result["unavailableReason"] = "osBelow26"
      result["contextCapacityNote"] =
        "SystemLanguageModel.supportsLocale/supportedLanguages/contextSize require iOS 26. Compile SDK iPhoneOS\(Self.compileSdkVersion) includes them; this OS cannot call them."
      result["tokenCountNote"] =
        "tokenCount(for:) requires iOS 26.4. Compile SDK iPhoneOS\(Self.compileSdkVersion); this OS is below 26."
    }
    #else
    result["availability"] = "unavailable"
    result["unavailableReason"] = "frameworkNotLinked"
    result["contextCapacityNote"] =
      "FoundationModels.framework not linked. Compile SDK recorded as iPhoneOS\(Self.compileSdkVersion)."
    #endif

    return result
  }

  private func selectQuotes(payload: [String: Any]) async throws -> [String: Any] {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      let started = Date()
      let moments = Self.whitelistMoments(payload["moments"])
      let promptChars = moments.reduce(0) { $0 + $1.note.count }
      switch SystemLanguageModel.default.availability {
      case .available:
        break
      case .unavailable(let reason):
        return [
          "status": "unavailable",
          "unavailableReason": self.reasonName(reason),
          "durationMs": 0,
          "promptCharsUsed": promptChars,
          "quotes": [],
        ]
      }

      let prompt = Self.buildPrompt(moments: moments)
      let session = LanguageModelSession()
      do {
        let response = try await session.respond(to: prompt)
        if Task.isCancelled {
          throw CancellationError()
        }
        let quotes = Self.parseQuotes(response.content, allowed: moments)
        let durationMs = Int(Date().timeIntervalSince(started) * 1000)
        return [
          "status": "ok",
          "durationMs": durationMs,
          "promptCharsUsed": promptChars,
          "quoteCount": quotes.count,
          "quotes": quotes,
        ]
      } catch is CancellationError {
        return [
          "status": "cancelled",
          "durationMs": Int(Date().timeIntervalSince(started) * 1000),
          "promptCharsUsed": promptChars,
          "quotes": [],
        ]
      } catch {
        return [
          "status": "failed",
          "unavailableReason": "generationFailed",
          "durationMs": Int(Date().timeIntervalSince(started) * 1000),
          "promptCharsUsed": promptChars,
          "quotes": [],
        ]
      }
    }
    #endif
    return [
      "status": "unavailable",
      "unavailableReason": "osBelow26",
      "durationMs": 0,
      "promptCharsUsed": 0,
      "quotes": [],
    ]
  }

  #if canImport(FoundationModels)
  @available(iOS 26.0, *)
  private func reasonName(_ reason: SystemLanguageModel.Availability.UnavailableReason) -> String {
    switch reason {
    case .deviceNotEligible:
      return "deviceNotEligible"
    case .appleIntelligenceNotEnabled:
      return "appleIntelligenceNotEnabled"
    case .modelNotReady:
      return "modelNotReady"
    @unknown default:
      return "unknown"
    }
  }
  #endif

  private struct ProbeMoment {
    let id: String
    let note: String
  }

  private static func whitelistMoments(_ raw: Any?) -> [ProbeMoment] {
    guard let rows = raw as? [[String: Any]] else { return [] }
    return rows.compactMap { row in
      guard let id = row["id"] as? String, let note = row["note"] as? String else { return nil }
      return ProbeMoment(id: id, note: note)
    }
  }

  private static func buildPrompt(moments: [ProbeMoment]) -> String {
    let lines = moments.enumerated().map { index, moment in
      "[\(index + 1)] id=\(moment.id) note=\(moment.note)"
    }.joined(separator: "\n")
    return """
    只做原文摘录。对下面每条记录，从 note 里复制连续原文，不要改写，不要概括，不要发明。
    只返回 JSON 数组，不要其它字：[{"id":"...","text":"..."}]
    \(lines)
    """
  }

  private static func parseQuotes(_ content: String, allowed: [ProbeMoment]) -> [[String: String]] {
    let notes = Dictionary(uniqueKeysWithValues: allowed.map { ($0.id, $0.note) })
    guard let data = extractJSONArray(content).data(using: .utf8),
          let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else {
      return []
    }
    return rows.compactMap { row in
      guard let id = row["id"] as? String, let text = row["text"] as? String else { return nil }
      guard notes[id] != nil else { return nil }
      return ["id": id, "text": text]
    }
  }

  private static func extractJSONArray(_ content: String) -> String {
    if let start = content.firstIndex(of: "["), let end = content.lastIndex(of: "]"), start <= end {
      return String(content[start ... end])
    }
    return content
  }

  private static func utsMachine() -> String {
    var systemInfo = utsname()
    uname(&systemInfo)
    return withUnsafePointer(to: &systemInfo.machine) { pointer in
      pointer.withMemoryRebound(to: CChar.self, capacity: Int(_SYS_NAMELEN)) { machine in
        String(cString: machine)
      }
    }
  }
}
