package com.nestledger.expensewidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.RemoteViews
import android.widget.Toast
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class ExpenseWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
    widgetIds.forEach { render(context, manager, it) }
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, widgetId: Int, options: Bundle) {
    render(context, manager, widgetId)
  }

  override fun onDeleted(context: Context, widgetIds: IntArray) {
    widgetIds.forEach { WidgetStore.deleteWidget(context, it) }
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_ADD) {
      super.onReceive(context, intent)
      return
    }
    val widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
    val shortcutId = intent.getStringExtra(EXTRA_SHORTCUT_ID) ?: return
    if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID ||
      intent.getStringExtra(EXTRA_NONCE) != WidgetStore.clickNonce(context, widgetId)) return
    val config = WidgetStore.config(context) ?: return
    val shortcut = config.shortcuts.firstOrNull { it.id == shortcutId } ?: return
    val token = WidgetStore.token(context)
    if (token == null) {
      val message = "Not saved: widget service unavailable"
      WidgetStore.setStatus(context, widgetId, message)
      render(context, AppWidgetManager.getInstance(context), widgetId)
      Toast.makeText(context, message, Toast.LENGTH_LONG).show()
      return
    }
    val date = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
    val tapId = WidgetStore.beginTap(context, widgetId, shortcutId, date) ?: return
    render(context, AppWidgetManager.getInstance(context), widgetId)
    val pending = goAsync()
    Thread {
      try {
        val response = sendExpense(config, token, shortcutId, tapId, date)
        if (response == 401 || response == 403) WidgetStore.clearToken(context)
        val success = response in 200..299
        val status = when {
          success -> "Added ${shortcut.name}"
          response == 401 || response == 403 -> "Not saved: open app to reconnect"
          response == 404 -> "Not saved: widget service needs an update"
          else -> "Not saved. Tap to retry"
        }
        WidgetStore.finishTap(context, widgetId, shortcutId, success, status)
        render(context, AppWidgetManager.getInstance(context), widgetId)
        Handler(Looper.getMainLooper()).post {
          Toast.makeText(context, if (success) "Expense saved" else status, Toast.LENGTH_LONG).show()
        }
      } catch (_: Exception) {
        WidgetStore.finishTap(context, widgetId, shortcutId, false, "Not saved. Tap to retry")
        render(context, AppWidgetManager.getInstance(context), widgetId)
      } finally {
        pending.finish()
      }
    }.start()
  }

  companion object {
    private const val ACTION_ADD = "com.nestledger.expensewidget.ADD"
    private const val EXTRA_SHORTCUT_ID = "shortcut_id"
    private const val EXTRA_NONCE = "nonce"

    fun refreshAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, ExpenseWidgetProvider::class.java))
      ids.forEach { render(context, manager, it) }
    }

    private fun render(context: Context, manager: AppWidgetManager, widgetId: Int) {
      val config = WidgetStore.config(context)
      val options = manager.getAppWidgetOptions(widgetId)
      val width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 110)
      val height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 100)
      val horizontal = width >= 180 && height < 180
      val views = RemoteViews(context.packageName,
        if (horizontal) R.layout.expense_widget_horizontal else R.layout.expense_widget)
      val mode = WidgetStore.themeMode(context)
      val dark = mode == "dark"
      val text = context.getColor(if (dark) R.color.expense_widget_text_dark else R.color.expense_widget_text_light)
      val muted = context.getColor(if (dark) R.color.expense_widget_muted_dark else R.color.expense_widget_muted_light)
      if (mode != "system") {
        views.setInt(R.id.widget_root, "setBackgroundResource",
          if (dark) R.drawable.expense_widget_background_dark else R.drawable.expense_widget_background_light)
        views.setTextColor(R.id.widget_title, text)
        views.setTextColor(R.id.widget_status, muted)
      }
      views.removeAllViews(R.id.widget_shortcuts)
      val connected = WidgetStore.token(context) != null
      val count = when {
        horizontal -> (width / 80).coerceIn(2, 3)
        width < 180 -> 1
        else -> ((height - 74) / 48).coerceIn(1, 10)
      }
      config?.shortcuts?.take(count)?.forEach { shortcut ->
        val row = RemoteViews(context.packageName,
          if (horizontal) R.layout.expense_widget_tile else R.layout.expense_widget_row)
        row.setTextViewText(R.id.widget_row_name, shortcut.name)
        row.setTextViewText(R.id.widget_row_amount, "${shortcut.amount} ${shortcut.currency}".trim())
        row.setContentDescription(R.id.widget_row, "Add ${shortcut.name}, ${shortcut.amount} ${shortcut.currency}")
        if (mode != "system") {
          row.setInt(R.id.widget_row, "setBackgroundResource",
            if (dark) R.drawable.expense_widget_row_background_dark else R.drawable.expense_widget_row_background_light)
          row.setTextColor(R.id.widget_row_name, text)
          row.setTextColor(R.id.widget_row_amount, muted)
        }
        row.setOnClickPendingIntent(R.id.widget_row, PendingIntent.getBroadcast(
          context,
          0,
          Intent(context, ExpenseWidgetProvider::class.java).apply {
            action = ACTION_ADD
            data = Uri.parse("nestledger-widget://add/$widgetId/${Uri.encode(shortcut.id)}")
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            putExtra(EXTRA_SHORTCUT_ID, shortcut.id)
            putExtra(EXTRA_NONCE, WidgetStore.clickNonce(context, widgetId))
          },
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        ))
        views.addView(R.id.widget_shortcuts, row)
      }
      views.setTextViewText(R.id.widget_status,
        if (config == null) "Open NestLedger to load" else WidgetStore.status(context, widgetId,
          if (connected) "Tap to add today’s expense" else "Widget service not connected"))
      manager.updateAppWidget(widgetId, views)
    }

    private fun sendExpense(config: WidgetConfig, token: String, shortcutId: String, tapId: String, date: String): Int {
      val body = JSONObject()
        .put("shortcut_id", shortcutId)
        .put("plan_id", config.planId)
        .put("tap_id", tapId)
        .put("date", date)
        .toString()
      val connection = URL("${config.apiBaseUrl}/widget/expense").openConnection() as HttpURLConnection
      try {
        connection.requestMethod = "POST"
        connection.connectTimeout = 4_000
        connection.readTimeout = 4_000
        connection.doOutput = true
        connection.setRequestProperty("Authorization", "Bearer $token")
        connection.setRequestProperty("Content-Type", "application/json")
        connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        return connection.responseCode
      } finally {
        connection.disconnect()
      }
    }
  }
}
