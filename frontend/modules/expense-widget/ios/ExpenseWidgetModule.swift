import ExpoModulesCore

public class ExpenseWidgetModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpenseWidget")

    AsyncFunction("setThemeAsync") { (mode: String) throws in
      try ExpenseWidgetStore.setTheme(mode)
    }

    AsyncFunction("configureAsync") { (token: String, apiBaseUrl: String, planId: String, shortcutsJson: String) throws in
      try ExpenseWidgetStore.configure(token: token, apiBaseUrl: apiBaseUrl, planId: planId, shortcutsJson: shortcutsJson)
    }

    AsyncFunction("getTokenAsync") { () throws -> String? in
      try ExpenseWidgetStore.token()
    }

    AsyncFunction("clearAsync") { () throws in
      try ExpenseWidgetStore.clear()
    }
  }
}
