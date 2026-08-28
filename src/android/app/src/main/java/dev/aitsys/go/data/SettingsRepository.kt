package dev.aitsys.go.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private val Context.dataStore by preferencesDataStore("settings")

class SettingsRepository(private val context: Context) {
    private val apiBaseKey = stringPreferencesKey("api_base")
    private val shareModeKey = stringPreferencesKey("share_mode")
    private val appLockEnabledKey = booleanPreferencesKey("app_lock_enabled")
    private val brandingKey = stringPreferencesKey("branding")
    private val secureToken = SecureTokenStore(context)

    suspend fun load(): Pair<AppSettings, String> {
        val values = context.dataStore.data.first()
        return AppSettings(
            apiBase = values[apiBaseKey] ?: "https://go.aitsys.dev",
            shareMode = runCatching { ShareMode.valueOf(values[shareModeKey].orEmpty()) }.getOrDefault(ShareMode.CONFIGURE),
            appLockEnabled = values[appLockEnabledKey] ?: false,
        ) to secureToken.get()
    }

    suspend fun save(settings: AppSettings, token: String) {
        val origin = ApiClient.normalizeOrigin(settings.apiBase)
        context.dataStore.edit {
            it[apiBaseKey] = origin
            it[shareModeKey] = settings.shareMode.name
            it[appLockEnabledKey] = settings.appLockEnabled
        }
        secureToken.set(ApiClient.normalizeToken(token))
    }

    suspend fun saveBrandingJson(json: String) = context.dataStore.edit { it[brandingKey] = json }
    suspend fun loadBrandingJson(): String? = context.dataStore.data.first()[brandingKey]

    suspend fun setAppLockEnabled(enabled: Boolean) = context.dataStore.edit { it[appLockEnabledKey] = enabled }

    fun clearToken() = secureToken.clear()
}

private class SecureTokenStore(context: Context) {
    private val prefs = context.getSharedPreferences("secure_token", Context.MODE_PRIVATE)
    private val alias = "aitsys_go_api_token"

    fun set(value: String) {
        if (value.isBlank()) return clear()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        prefs.edit()
            .putString("ciphertext", Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .apply()
    }

    fun get(): String {
        val encrypted = prefs.getString("ciphertext", null) ?: return ""
        val iv = prefs.getString("iv", null) ?: return ""
        return runCatching {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
            String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), Charsets.UTF_8)
        }.getOrElse {
            clear()
            ""
        }
    }

    fun clear() { prefs.edit().clear().apply() }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(
                KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build()
            )
            generateKey()
        }
    }
}
