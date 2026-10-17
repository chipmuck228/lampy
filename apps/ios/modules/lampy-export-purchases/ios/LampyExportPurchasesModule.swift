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
    #if DEBUG
    print("[LampyStoreKit] entitlement-query start id=\(id)")
    var count = 0
    #endif
    for await result in Transaction.currentEntitlements {
      #if DEBUG
      count += 1
      #endif
      switch result {
      case .verified(let transaction):
        #if DEBUG
        print("[LampyStoreKit] entitlement verified product=\(transaction.productID) type=\(transaction.productType) revoked=\(transaction.revocationDate != nil)")
        #endif
        if transaction.productID == id && transaction.productType == .nonConsumable && transaction.revocationDate == nil {
          return true
        }
      case .unverified(let transaction, let error):
        #if DEBUG
        let verificationError = error as NSError
        print("[LampyStoreKit] entitlement unverified product=\(transaction.productID) domain=\(verificationError.domain) code=\(verificationError.code)")
        #endif
        if transaction.productID == id { throw ExportPurchaseFailure.unverified }
      }
    }
    #if DEBUG
    print("[LampyStoreKit] entitlement-query end count=\(count) owned=false")
    // Observe pending deliveries without granting access or finishing them.
    var unfinishedCount = 0
    for await result in Transaction.unfinished {
      unfinishedCount += 1
      switch result {
      case .verified(let transaction):
        print("[LampyStoreKit] unfinished verified product=\(transaction.productID) type=\(transaction.productType)")
      case .unverified(let transaction, let error):
        let verificationError = error as NSError
        print("[LampyStoreKit] unfinished unverified product=\(transaction.productID) domain=\(verificationError.domain) code=\(verificationError.code)")
      }
    }
    print("[LampyStoreKit] unfinished-query end count=\(unfinishedCount)")
    #endif
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

  func purchase(_ expected: String, accountToken: UUID? = nil) async throws -> [String: String] {
    let id = try configuredExportProductID(expected)
    guard !busy else { throw ExportPurchaseFailure.busy }
    busy = true
    defer { busy = false }
    if try await owns(id) { return ["status": "already-owned"] }
    let item = try await product(id)
    let options: Set<Product.PurchaseOption> = accountToken.map { [.appAccountToken($0)] } ?? []
    switch try await item.purchase(options: options) {
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

  func currentPurchase(_ expected: String, accountToken: String) async throws -> [String: String]? {
    let id = try configuredExportProductID(expected)
    guard let token = UUID(uuidString: accountToken) else { throw ExportPurchaseFailure.unavailable }
    for await result in Transaction.currentEntitlements {
      guard case .verified(let transaction) = result else { continue }
      if transaction.productID == id && transaction.productType == .nonConsumable && transaction.revocationDate == nil && transaction.ownershipType == .purchased && transaction.appAccountToken == token {
        return ["transactionId": String(transaction.id)]
      }
    }
    return nil
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
      #if DEBUG
      print("[LampyStoreKit] transaction-listener start id=\(id)")
      #endif
      self?.updates = Task { [weak self] in
        for await result in Transaction.updates {
          if Task.isCancelled { return }
          #if DEBUG
          switch result {
          case .verified(let transaction):
            print("[LampyStoreKit] transaction-update verified product=\(transaction.productID)")
          case .unverified(let transaction, let error):
            let verificationError = error as NSError
            print("[LampyStoreKit] transaction-update unverified product=\(transaction.productID) domain=\(verificationError.domain) code=\(verificationError.code)")
          }
          #endif
          // Unverified transactions never grant or finish an entitlement.
          guard case .verified(let transaction) = result, transaction.productID == id else { continue }
          await transaction.finish()
          self?.sendEvent("onEntitlementsChanged", [:])
        }
      }
    }
    OnDestroy { [weak self] in self?.updates?.cancel(); self?.updates = nil }
    AsyncFunction("hasEntitlement") { (expected: String) async throws -> Bool in
      guard Bundle.main.object(forInfoDictionaryKey: "LampyUnifiedPurchasesEnabled") as? Bool != true else { throw ExportPurchaseFailure.disabled }
      let id = try configuredExportProductID(expected)
      return try await ExportPurchaseStore.shared.owns(id)
    }
    AsyncFunction("status") { (expected: String) async throws -> [String: Any] in try await ExportPurchaseStore.shared.status(expected) }
    AsyncFunction("purchase") { (expected: String) async throws -> [String: String] in
      guard Bundle.main.object(forInfoDictionaryKey: "LampyUnifiedPurchasesEnabled") as? Bool != true else { throw ExportPurchaseFailure.disabled }
      return try await ExportPurchaseStore.shared.purchase(expected)
    }
    AsyncFunction("purchaseForAccount") { (expected: String, accountToken: String) async throws -> [String: String] in
      guard Bundle.main.object(forInfoDictionaryKey: "LampyUnifiedPurchasesEnabled") as? Bool == true,
            let token = UUID(uuidString: accountToken) else { throw ExportPurchaseFailure.disabled }
      // Existing purchases bound to another Lampy account are never silently reassigned.
      if try await ExportPurchaseStore.shared.owns(expected), try await ExportPurchaseStore.shared.currentPurchase(expected, accountToken: accountToken) == nil { throw ExportPurchaseFailure.unavailable }
      return try await ExportPurchaseStore.shared.purchase(expected, accountToken: token)
    }
    AsyncFunction("currentPurchase") { (expected: String, accountToken: String) async throws -> [String: String]? in
      return try await ExportPurchaseStore.shared.currentPurchase(expected, accountToken: accountToken)
    }
    AsyncFunction("restore") { (expected: String) async throws -> [String: Any] in try await ExportPurchaseStore.shared.restore(expected) }
  }
}
