import ExpoModulesCore
import StoreKit

private enum ExportPurchaseFailure: String, Error {
  case disabled = "EXPORT_PURCHASES_DISABLED"
  case unavailable = "EXPORT_PRODUCT_UNAVAILABLE"
  case unverified = "EXPORT_PURCHASE_UNVERIFIED"
  case busy = "EXPORT_PURCHASE_BUSY"
}

private func configuredExportProductID(_ expected: String? = nil) throws -> String {
  guard Bundle.main.object(forInfoDictionaryKey: "LampyPaidExportEnabled") as? Bool == true,
        let id = Bundle.main.object(forInfoDictionaryKey: "LampyExportProductID") as? String,
        !id.isEmpty else { throw ExportPurchaseFailure.disabled }
  if let expected = expected, expected != id { throw ExportPurchaseFailure.unavailable }
  return id
}

private actor ExportPurchaseStore {
  static let shared = ExportPurchaseStore()
  private var busy = false

  func owns(_ id: String) async throws -> Bool {
    for await result in Transaction.currentEntitlements {
      switch result {
      case .verified(let transaction):
        if transaction.productID == id && transaction.productType == .nonConsumable && transaction.revocationDate == nil {
          return true
        }
      case .unverified(let transaction, _):
        if transaction.productID == id { throw ExportPurchaseFailure.unverified }
      }
    }
    return false
  }

  private func product(_ id: String) async throws -> Product {
    #if DEBUG
    print("[LampyStoreKit] product-query start id=\(id) bundle=\(Bundle.main.bundleIdentifier ?? "unknown")")
    #endif
    let products = try await Product.products(for: [id])
    #if DEBUG
    let details = products.map { "\($0.id):\($0.type)" }.joined(separator: ",")
    print("[LampyStoreKit] product-query returned count=\(products.count) products=\(details)")
    #endif
    guard let item = products.first,
          item.id == id, item.type == .nonConsumable else { throw ExportPurchaseFailure.unavailable }
    return item
  }

  func status(_ expected: String) async throws -> [String: Any] {
    let id = try configuredExportProductID(expected)
    let owned = try await owns(id)
    // Existing verified owners can export even if the price lookup is offline.
    let item: Product?
    do {
      item = try await product(id)
    } catch {
      #if DEBUG
      // Log error identifiers only: no account, receipt, or transaction data.
      let nativeError = error as NSError
      print("[LampyStoreKit] product-query failed domain=\(nativeError.domain) code=\(nativeError.code)")
      if let underlying = nativeError.userInfo[NSUnderlyingErrorKey] as? NSError {
        print("[LampyStoreKit] underlying domain=\(underlying.domain) code=\(underlying.code)")
      }
      #endif
      item = nil
    }
    var result: [String: Any] = ["owned": owned, "product": NSNull()]
    if let item = item { result["product"] = ["id": item.id, "name": item.displayName, "price": item.displayPrice] }
    return result
  }

  func purchase(_ expected: String) async throws -> [String: String] {
    let id = try configuredExportProductID(expected)
    guard !busy else { throw ExportPurchaseFailure.busy }
    busy = true
    defer { busy = false }
    if try await owns(id) { return ["status": "already-owned"] }
    let item = try await product(id)
    switch try await item.purchase() {
    case .success(let result):
      guard case .verified(let transaction) = result,
            transaction.productID == id, transaction.productType == .nonConsumable,
            transaction.revocationDate == nil else { throw ExportPurchaseFailure.unverified }
      await transaction.finish()
      return ["status": "purchased"]
    case .userCancelled: return ["status": "cancelled"]
    case .pending: return ["status": "pending"]
    @unknown default: throw ExportPurchaseFailure.unavailable
    }
  }

  func restore(_ expected: String) async throws -> [String: Any] {
    _ = try configuredExportProductID(expected)
    guard !busy else { throw ExportPurchaseFailure.busy }
    busy = true
    defer { busy = false }
    // Only called from an explicit user action, never on launch or each export.
    try await AppStore.sync()
    return try await status(expected)
  }
}

public final class LampyExportPurchasesModule: Module {
  private var updates: Task<Void, Never>?
  deinit { updates?.cancel() }
  public func definition() -> ModuleDefinition {
    Name("LampyExportPurchases")
    Events("onEntitlementsChanged")
    OnCreate { [weak self] in
      guard let id = try? configuredExportProductID() else { return }
      self?.updates = Task { [weak self] in
        for await result in Transaction.updates {
          if Task.isCancelled { return }
          // Unverified transactions never grant or finish an entitlement.
          guard case .verified(let transaction) = result, transaction.productID == id else { continue }
          await transaction.finish()
          self?.sendEvent("onEntitlementsChanged", [:])
        }
      }
    }
    OnDestroy { [weak self] in self?.updates?.cancel(); self?.updates = nil }
    AsyncFunction("hasEntitlement") { (expected: String) async throws -> Bool in
      let id = try configuredExportProductID(expected)
      return try await ExportPurchaseStore.shared.owns(id)
    }
    AsyncFunction("status") { (expected: String) async throws -> [String: Any] in try await ExportPurchaseStore.shared.status(expected) }
    AsyncFunction("purchase") { (expected: String) async throws -> [String: String] in try await ExportPurchaseStore.shared.purchase(expected) }
    AsyncFunction("restore") { (expected: String) async throws -> [String: Any] in try await ExportPurchaseStore.shared.restore(expected) }
  }
}
