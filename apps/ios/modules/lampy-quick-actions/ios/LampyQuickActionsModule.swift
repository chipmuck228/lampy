import ExpoModulesCore
import UIKit

// UIKit calls the subscriber on main; JS may consume from another queue.
// The mailbox holds only one public action ID, never notes or media paths.
private final class QuickActionMailbox: @unchecked Sendable {
  static let shared = QuickActionMailbox()
  static let changed = Notification.Name("LampyQuickActionChanged")
  private let lock = NSLock()
  private var pending: [String: String]?

  func receive(_ item: UIApplicationShortcutItem) -> Bool {
    guard ["app.lampy.write", "app.lampy.camera", "app.lampy.record", "app.lampy.share"].contains(item.type) else {
      return false
    }
    lock.lock()
    pending = ["id": item.type, "requestId": UUID().uuidString]
    lock.unlock()
    NotificationCenter.default.post(name: Self.changed, object: nil)
    return true
  }

  func consume() -> [String: String]? {
    lock.lock()
    defer { lock.unlock() }
    let result = pending
    pending = nil
    return result
  }
}

public final class LampyQuickActionsAppDelegate: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication,
                          didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    if let item = launchOptions?[.shortcutItem] as? UIApplicationShortcutItem {
      _ = QuickActionMailbox.shared.receive(item)
    }
    return true
  }

  // Expo 57 also forwards scene connectionOptions.shortcutItem here on cold launch.
  public func application(_ application: UIApplication, performActionFor item: UIApplicationShortcutItem,
                          completionHandler: @escaping (Bool) -> Void) {
    completionHandler(QuickActionMailbox.shared.receive(item))
  }
}

public final class LampyQuickActionsModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("LampyQuickActions")
    Events("onAction")
    Function("consumePending") { () -> [String: String]? in
      QuickActionMailbox.shared.consume()
    }
    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(
        forName: QuickActionMailbox.changed, object: nil, queue: .main
      ) { [weak self] _ in
        guard let self, let action = QuickActionMailbox.shared.consume() else { return }
        self.sendEvent("onAction", action)
      }
    }
    OnStopObserving {
      if let observer = self.observer { NotificationCenter.default.removeObserver(observer) }
      self.observer = nil
    }
    OnDestroy {
      if let observer = self.observer { NotificationCenter.default.removeObserver(observer) }
      self.observer = nil
    }
  }
}
