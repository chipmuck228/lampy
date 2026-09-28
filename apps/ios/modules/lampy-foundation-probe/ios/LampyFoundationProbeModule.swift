import ExpoModulesCore
import UIKit

#if canImport(FoundationModels)
import FoundationModels
#endif

public class LampyFoundationProbeModule: Module {
  private var generationTask: Task<Void, Never>?

  public func definition() -> ModuleDefinition {
    Name("LampyFoundationProbe")

    AsyncFunction("inspect") { () -> [String: Any] in
      self.inspect()
    }

    AsyncFunction("selectQuotes") { (payload: [String: Any]) -> [String: Any] in
      try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[String: Any], Error>) in
        self.generationTask?.cancel()
        self.generationTask = Task {
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

    Function("cancel") {
      self.generationTask?.cancel()
    }
  }

  private func inspect() -> [String: Any] {
    var result: [String: Any] = [
      "linked": true,
      "osName": UIDevice.current.systemName,
      "osVersion": UIDevice.current.systemVersion,
      "localeIdentifier": Locale.current.identifier,
      "preferredLanguages": Locale.preferredLanguages,
      "contextCapacityTokens": NSNull(),
      "contextCapacityNote": "API does not expose a token window; measure with promptCharsUsed",
    ]

    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      switch SystemLanguageModel.default.availability {
      case .available:
        result["availability"] = "available"
        result["unavailableReason"] = NSNull()
      case .unavailable(let reason):
        result["availability"] = "unavailable"
        result["unavailableReason"] = self.reasonName(reason)
      }
    } else {
      result["availability"] = "unavailable"
      result["unavailableReason"] = "osBelow26"
    }
    #else
    result["availability"] = "unavailable"
    result["unavailableReason"] = "frameworkNotLinked"
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
}
