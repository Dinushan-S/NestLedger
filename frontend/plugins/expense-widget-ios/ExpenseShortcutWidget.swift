import AppIntents
import Foundation
import SwiftUI
import WidgetKit

private struct ShortcutEntry: TimelineEntry {
  let date: Date
  let snapshot: ExpenseWidgetStore.Snapshot?
}

private struct ShortcutProvider: TimelineProvider {
  func placeholder(in context: Context) -> ShortcutEntry {
    ShortcutEntry(date: Date(), snapshot: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (ShortcutEntry) -> Void) {
    completion(ShortcutEntry(date: Date(), snapshot: ExpenseWidgetStore.snapshot()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<ShortcutEntry>) -> Void) {
    completion(Timeline(entries: [ShortcutEntry(date: Date(), snapshot: ExpenseWidgetStore.snapshot())], policy: .never))
  }
}

struct AddShortcutExpenseIntent: AppIntent {
  static var title: LocalizedStringResource = "Add shortcut expense"

  @Parameter(title: "Shortcut ID") var shortcutId: String

  init() {}

  init(shortcutId: String) {
    self.shortcutId = shortcutId
  }

  func perform() async throws -> some IntentResult {
    guard let snapshot = ExpenseWidgetStore.snapshot(),
      snapshot.shortcuts.contains(where: { $0.id == shortcutId }),
      let token = try? ExpenseWidgetStore.token(),
      !token.isEmpty,
      let url = URL(string: snapshot.apiBaseUrl + "/widget/expense") else {
      ExpenseWidgetStore.setStatus("Not saved: service not connected", for: shortcutId, completed: false)
      WidgetCenter.shared.reloadTimelines(ofKind: "ExpenseShortcutWidget")
      return .result()
    }

    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.timeZone = .current
    let date = formatter.string(from: Date())
    let tapId = ExpenseWidgetStore.pendingTapId(for: shortcutId, date: date)
    ExpenseWidgetStore.setStatus("Saving…", for: shortcutId, completed: false)
    WidgetCenter.shared.reloadTimelines(ofKind: "ExpenseShortcutWidget")
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = 15
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: [
      "shortcut_id": shortcutId,
      "plan_id": snapshot.planId,
      "tap_id": tapId,
      "date": date,
    ])

    do {
      let (_, response) = try await URLSession.shared.data(for: request)
      guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
      if http.statusCode == 401 || http.statusCode == 403 {
        try? ExpenseWidgetStore.clearToken()
        ExpenseWidgetStore.setStatus("Not saved: open app to reconnect", for: shortcutId, completed: false)
      } else if (200..<300).contains(http.statusCode) {
        ExpenseWidgetStore.setStatus("Saved", for: shortcutId, completed: true)
      } else {
        ExpenseWidgetStore.setStatus("Not saved. Tap to retry", for: shortcutId, completed: false)
      }
    } catch {
      ExpenseWidgetStore.setStatus("Not saved. Tap to retry", for: shortcutId, completed: false)
    }
    WidgetCenter.shared.reloadTimelines(ofKind: "ExpenseShortcutWidget")
    return .result()
  }
}

private struct ShortcutWidgetView: View {
  let entry: ShortcutEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var colorScheme

  private var dark: Bool {
    let mode = ExpenseWidgetStore.themeMode()
    return mode == "dark" || (mode == "system" && colorScheme == .dark)
  }

  private var background: Color {
    dark ? Color(red: 30.0 / 255, green: 34.0 / 255, blue: 32.0 / 255)
      : Color(red: 246.0 / 255, green: 245.0 / 255, blue: 242.0 / 255)
  }

  private var tileBackground: Color {
    dark ? Color(red: 36.0 / 255, green: 53.0 / 255, blue: 48.0 / 255)
      : Color(red: 229.0 / 255, green: 239.0 / 255, blue: 233.0 / 255)
  }

  private var foreground: Color {
    dark ? Color(red: 235.0 / 255, green: 233.0 / 255, blue: 228.0 / 255)
      : Color(red: 45.0 / 255, green: 49.0 / 255, blue: 47.0 / 255)
  }

  private var muted: Color {
    dark ? Color(red: 165.0 / 255, green: 173.0 / 255, blue: 167.0 / 255)
      : Color(red: 110.0 / 255, green: 115.0 / 255, blue: 112.0 / 255)
  }

  private var connected: Bool {
    guard let token = try? ExpenseWidgetStore.token() else { return false }
    return !token.isEmpty
  }

  private var limit: Int {
    switch family {
    case .systemSmall: return 1
    case .systemMedium: return 3
    case .systemLarge: return 6
    case .systemExtraLarge: return 10
    default: return 1
    }
  }

  private var columns: [GridItem] {
    switch family {
    case .systemMedium: return Array(repeating: GridItem(.flexible(), spacing: 6), count: 3)
    case .systemLarge: return Array(repeating: GridItem(.flexible(), spacing: 6), count: 2)
    case .systemExtraLarge: return Array(repeating: GridItem(.flexible(), spacing: 6), count: 5)
    default: return [GridItem(.flexible(), spacing: 6)]
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Quick Add")
        .font(.headline)
        .foregroundStyle(foreground)
      if let snapshot = entry.snapshot, !snapshot.shortcuts.isEmpty {
        LazyVGrid(columns: columns, alignment: .leading, spacing: 6) {
          ForEach(Array(snapshot.shortcuts.prefix(limit))) { shortcut in
            Button(intent: AddShortcutExpenseIntent(shortcutId: shortcut.id)) {
              VStack(alignment: .leading, spacing: 2) {
                Text(shortcut.name)
                  .font(.subheadline)
                  .fontWeight(.semibold)
                  .lineLimit(1)
                Text("\(shortcut.currency) \(shortcut.amount, specifier: "%.2f")")
                  .font(.caption)
                  .lineLimit(1)
                Text(ExpenseWidgetStore.status(for: shortcut.id) ?? (connected ? "Tap to add" : "Service not connected"))
                  .font(.caption2)
                  .lineLimit(2)
                  .foregroundStyle(muted)
              }
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(.horizontal, 8)
              .padding(.vertical, 6)
              .background(tileBackground, in: RoundedRectangle(cornerRadius: 9))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Add \(shortcut.name) expense")
          }
        }
      } else {
        Text("Open NestLedger to load shortcuts")
          .font(.subheadline)
          .foregroundStyle(muted)
      }
      Spacer(minLength: 0)
    }
    .padding(12)
    .foregroundStyle(foreground)
    .containerBackground(background, for: .widget)
  }
}

struct ExpenseShortcutWidget: Widget {
  let kind = "ExpenseShortcutWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: ShortcutProvider()) { entry in
      ShortcutWidgetView(entry: entry)
    }
    .configurationDisplayName("Expense Shortcuts")
    .description("Add saved expenses with one tap.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .systemExtraLarge])
  }
}

@main
struct ExpenseShortcutWidgetBundle: WidgetBundle {
  var body: some Widget {
    ExpenseShortcutWidget()
  }
}
