package com.nestledger.expensewidget

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal data class Shortcut(val id: String, val name: String, val amount: String, val currency: String)
internal data class WidgetConfig(val apiBaseUrl: String, val planId: String, val shortcuts: List<Shortcut>)

internal object WidgetStore {
  private const val PREFS = "expense_shortcut_widget"
  private const val KEY_ALIAS = "expense_shortcut_widget_token"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun configure(context: Context, token: String, apiBaseUrl: String, planId: String, shortcutsJson: String) {
    val uri = URI(apiBaseUrl)
    require(uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.query == null && uri.fragment == null) {
      "Widget API URL must be HTTPS"
    }
    require(planId.isNotBlank()) { "Widget plan is required" }
    val shortcuts = JSONArray(shortcutsJson)
    require(shortcuts.length() in 1..10) { "Select 1 to 10 shortcuts" }
    for (index in 0 until shortcuts.length()) {
      val item = shortcuts.getJSONObject(index)
      require(item.optString("id").isNotBlank() && item.optString("name").isNotBlank()) {
        "Shortcut id and name are required"
      }
    }
    val encoded = if (token.isNotBlank()) {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, key())
      val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
      Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP)
    } else null
    val settings = prefs(context)
    val edit = settings.edit()
    if (settings.getString("planId", null) != planId || (settings.getString("token", null) == null && token.isNotBlank())) {
      for (key in settings.all.keys) {
        if (key.startsWith("tap.") || key.startsWith("date.") || key.startsWith("since.") || key.startsWith("status.")) edit.remove(key)
      }
    }
    check(edit
      .putString("token", encoded)
      .putString("apiBaseUrl", apiBaseUrl.trimEnd('/'))
      .putString("planId", planId)
      .putString("shortcuts", shortcutsJson)
      .commit()) { "Could not save widget configuration" }
  }

  fun config(context: Context): WidgetConfig? {
    val settings = prefs(context)
    val apiBaseUrl = settings.getString("apiBaseUrl", null) ?: return null
    val planId = settings.getString("planId", null) ?: return null
    val json = settings.getString("shortcuts", null) ?: return null
    return try {
      val array = JSONArray(json)
      WidgetConfig(apiBaseUrl, planId, (0 until array.length()).map { index ->
        val item = array.getJSONObject(index)
        Shortcut(item.getString("id"), item.getString("name"), item.optString("amount"), item.optString("currency"))
      })
    } catch (_: Exception) {
      null
    }
  }

  fun token(context: Context): String? {
    val encoded = prefs(context).getString("token", null) ?: return null
    return try {
      val bytes = Base64.decode(encoded, Base64.NO_WRAP)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
      String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
    } catch (_: Exception) {
      null
    }
  }

  fun clear(context: Context) {
    val mode = themeMode(context)
    check(prefs(context).edit().clear().putString("themeMode", mode).commit()) { "Could not clear widget configuration" }
  }

  fun themeMode(context: Context): String = prefs(context).getString("themeMode", "system") ?: "system"

  fun setTheme(context: Context, mode: String) {
    require(mode in listOf("system", "light", "dark")) { "Invalid widget theme" }
    check(prefs(context).edit().putString("themeMode", mode).commit()) { "Could not save widget theme" }
  }

  fun setStatus(context: Context, widgetId: Int, status: String) {
    prefs(context).edit().putString("status.$widgetId", status).commit()
  }

  fun clearToken(context: Context) {
    prefs(context).edit().remove("token").commit()
  }

  fun clickNonce(context: Context, widgetId: Int): String {
    val settings = prefs(context)
    val key = "nonce.$widgetId"
    return settings.getString(key, null) ?: UUID.randomUUID().toString().also {
      settings.edit().putString(key, it).commit()
    }
  }

  fun pendingTapId(context: Context, widgetId: Int, shortcutId: String): String? =
    prefs(context).getString("tap.$widgetId.$shortcutId", null)

  fun beginTap(context: Context, widgetId: Int, shortcutId: String, date: String): String? {
    val settings = prefs(context)
    val sinceKey = "since.$widgetId.$shortcutId"
    if (System.currentTimeMillis() - settings.getLong(sinceKey, 0) < 10_000) return null
    val dateKey = "date.$widgetId.$shortcutId"
    val tapId = if (settings.getString(dateKey, null) == date) pendingTapId(context, widgetId, shortcutId) else null
    val nextTapId = tapId ?: UUID.randomUUID().toString()
    settings.edit()
      .putString("tap.$widgetId.$shortcutId", nextTapId)
      .putString(dateKey, date)
      .putLong(sinceKey, System.currentTimeMillis())
      .putString("status.$widgetId", "Saving…")
      .commit()
    return nextTapId
  }

  fun finishTap(context: Context, widgetId: Int, shortcutId: String, success: Boolean, status: String) {
    val edit = prefs(context).edit().remove("since.$widgetId.$shortcutId")
      .putString("status.$widgetId", status)
    if (success) edit.remove("tap.$widgetId.$shortcutId").remove("date.$widgetId.$shortcutId")
    edit.commit()
  }

  fun status(context: Context, widgetId: Int, default: String = "Tap to add today’s expense"): String {
    val settings = prefs(context)
    val value = settings.getString("status.$widgetId", default) ?: ""
    if (value == "Saving…") {
      val active = settings.all.keys.filter { it.startsWith("since.$widgetId.") }
        .any { System.currentTimeMillis() - settings.getLong(it, 0) < 10_000 }
      if (!active) return "Tap to retry"
    }
    return value
  }

  fun deleteWidget(context: Context, widgetId: Int) {
    val settings = prefs(context)
    val edit = settings.edit()
    for (key in settings.all.keys) {
      if (key == "nonce.$widgetId" || key == "status.$widgetId" ||
        key.startsWith("tap.$widgetId.") || key.startsWith("date.$widgetId.") || key.startsWith("since.$widgetId.")) edit.remove(key)
    }
    edit.commit()
  }

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
      init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .build())
      generateKey()
    }
  }
}
