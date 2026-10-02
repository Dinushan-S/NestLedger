import Foundation
import Security
import WidgetKit

enum ExpenseWidgetStore {
  struct Shortcut: Codable, Identifiable {
    let id: String
    let name: String
    let amount: Double
    let currency: String
  }

  struct Snapshot: Codable {
    let apiBaseUrl: String
    let planId: String
    let shortcuts: [Shortcut]
  }

  private static let widgetKind = "ExpenseShortcutWidget"
  private static let snapshotKey = "expenseWidget.snapshot"
  private static let tokenService = "ExpenseWidgetToken"
  private static let tokenAccount = "active"

  private static var appBundleId: String {
    let bundleId = Bundle.main.bundleIdentifier ?? ""
    let suffix = ".ExpenseShortcutWidgetExtension"
    return bundleId.hasSuffix(suffix) ? String(bundleId.dropLast(suffix.count)) : bundleId
  }

  private static var defaults: UserDefaults? {
    UserDefaults(suiteName: "group.\(appBundleId)")
  }

  private static func tokenQuery() throws -> [String: Any] {
    guard !appBundleId.isEmpty else {
      throw NSError(domain: "ExpenseWidget", code: 1, userInfo: [NSLocalizedDescriptionKey: "Widget bundle identifier is unavailable"])
    }
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: tokenService,
      kSecAttrAccount as String: tokenAccount,
      kSecAttrAccessGroup as String: "group.\(appBundleId)",
    ]
  }

  static func token() throws -> String? {
    var query = try tokenQuery()
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data, let token = String(data: data, encoding: .utf8) else {
      throw NSError(domain: "ExpenseWidget", code: Int(status), userInfo: [NSLocalizedDescriptionKey: "Unable to read widget token"])
    }
    return token
  }

  private static func saveToken(_ token: String) throws {
    let query = try tokenQuery()
    let data = Data(token.utf8)
    let updateStatus = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    if updateStatus == errSecSuccess { return }
    guard updateStatus == errSecItemNotFound else {
      throw NSError(domain: "ExpenseWidget", code: Int(updateStatus), userInfo: [NSLocalizedDescriptionKey: "Unable to update widget token"])
    }
    var add = query
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let addStatus = SecItemAdd(add as CFDictionary, nil)
    guard addStatus == errSecSuccess else {
      throw NSError(domain: "ExpenseWidget", code: Int(addStatus), userInfo: [NSLocalizedDescriptionKey: "Unable to save widget token"])
    }
  }

  static func configure(token: String, apiBaseUrl: String, planId: String, shortcutsJson: String) throws {
    guard !planId.isEmpty,
      let url = URL(string: apiBaseUrl), url.scheme == "https", url.host != nil,
      let shortcuts = try? JSONDecoder().decode([Shortcut].self, from: Data(shortcutsJson.utf8)),
      !shortcuts.isEmpty, shortcuts.count <= 10,
      shortcuts.allSatisfy({ !$0.id.isEmpty && !$0.name.isEmpty && $0.amount.isFinite }) else {
      throw NSError(domain: "ExpenseWidget", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid widget configuration"])
    }
    guard let defaults else {
      throw NSError(domain: "ExpenseWidget", code: 3, userInfo: [NSLocalizedDescriptionKey: "Widget App Group is unavailable"])
    }
    let previousPlanId = snapshot()?.planId
    if !token.isEmpty { try saveToken(token) } else { try clearToken() }
    let snapshot = Snapshot(apiBaseUrl: apiBaseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/")), planId: planId, shortcuts: shortcuts)
    defaults.set(try JSONEncoder().encode(snapshot), forKey: snapshotKey)
    let currentIds = Set(shortcuts.map(\.id))
    for key in defaults.dictionaryRepresentation().keys {
      let prefix = key.hasPrefix("expenseWidget.pending.") ? "expenseWidget.pending."
        : key.hasPrefix("expenseWidget.pendingDate.") ? "expenseWidget.pendingDate." : "expenseWidget.status."
      if key.hasPrefix(prefix), (previousPlanId != planId || !currentIds.contains(String(key.dropFirst(prefix.count)))) {
        defaults.removeObject(forKey: key)
      }
    }
    WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
  }

  static func clear() throws {
    if let defaults {
      defaults.removeObject(forKey: snapshotKey)
      for key in defaults.dictionaryRepresentation().keys where key.hasPrefix("expenseWidget.pending.") || key.hasPrefix("expenseWidget.pendingDate.") || key.hasPrefix("expenseWidget.status.") {
        defaults.removeObject(forKey: key)
      }
    }
    try clearToken()
    WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
  }

  static func clearToken() throws {
    let status = SecItemDelete(try tokenQuery() as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw NSError(domain: "ExpenseWidget", code: Int(status), userInfo: [NSLocalizedDescriptionKey: "Unable to clear widget token"])
    }
  }

  static func snapshot() -> Snapshot? {
    guard let data = defaults?.data(forKey: snapshotKey) else { return nil }
    return try? JSONDecoder().decode(Snapshot.self, from: data)
  }

  static func themeMode() -> String {
    defaults?.string(forKey: "expenseWidget.themeMode") ?? "system"
  }

  static func setTheme(_ mode: String) throws {
    guard ["system", "light", "dark"].contains(mode), let defaults else {
      throw NSError(domain: "ExpenseWidget", code: 4, userInfo: [NSLocalizedDescriptionKey: "Invalid widget theme"])
    }
    defaults.set(mode, forKey: "expenseWidget.themeMode")
    WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
  }

  static func status(for shortcutId: String) -> String? {
    defaults?.string(forKey: "expenseWidget.status.\(shortcutId)")
  }

  static func pendingTapId(for shortcutId: String, date: String) -> String {
    let key = "expenseWidget.pending.\(shortcutId)"
    let dateKey = "expenseWidget.pendingDate.\(shortcutId)"
    if defaults?.string(forKey: dateKey) == date,
      let existing = defaults?.string(forKey: key) { return existing }
    let tapId = UUID().uuidString
    defaults?.set(tapId, forKey: key)
    defaults?.set(date, forKey: dateKey)
    return tapId
  }

  static func setStatus(_ status: String, for shortcutId: String, completed: Bool) {
    defaults?.set(status, forKey: "expenseWidget.status.\(shortcutId)")
    if completed {
      defaults?.removeObject(forKey: "expenseWidget.pending.\(shortcutId)")
      defaults?.removeObject(forKey: "expenseWidget.pendingDate.\(shortcutId)")
    }
  }
}
