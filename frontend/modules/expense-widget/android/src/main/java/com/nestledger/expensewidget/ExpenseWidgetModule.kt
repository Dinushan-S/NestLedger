package com.nestledger.expensewidget

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpenseWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpenseWidget")

    AsyncFunction("setThemeAsync") { mode: String ->
      val context = appContext.reactContext ?: error("App context unavailable")
      WidgetStore.setTheme(context, mode)
      ExpenseWidgetProvider.refreshAll(context)
    }

    AsyncFunction("configureAsync") { token: String, apiBaseUrl: String, planId: String, shortcutsJson: String ->
      val context = appContext.reactContext ?: error("App context unavailable")
      WidgetStore.configure(context, token, apiBaseUrl, planId, shortcutsJson)
      ExpenseWidgetProvider.refreshAll(context)
    }

    AsyncFunction("getTokenAsync") {
      val context = appContext.reactContext ?: error("App context unavailable")
      WidgetStore.token(context)
    }

    AsyncFunction("clearAsync") {
      val context = appContext.reactContext ?: error("App context unavailable")
      WidgetStore.clear(context)
      ExpenseWidgetProvider.refreshAll(context)
    }
  }
}
