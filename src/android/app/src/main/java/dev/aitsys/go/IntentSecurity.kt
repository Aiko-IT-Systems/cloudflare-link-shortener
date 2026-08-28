package dev.aitsys.go

import dev.aitsys.go.data.UrlExtractor

internal object IntentSecurity {
    const val MAX_SHARED_TEXT_LENGTH = 16_384

    fun isPlainTextShare(
        action: String?,
        mimeType: String?,
    ): Boolean = action == ACTION_SEND && mimeType == MIME_TEXT_PLAIN

    fun validatedSharedText(value: CharSequence?): String? {
        if (value == null || value.length > MAX_SHARED_TEXT_LENGTH) return null
        val text = value.toString()
        return text.takeIf {
            it.isNotBlank() &&
                '\u0000' !in it
        }
    }

    fun normalizedHttpsUrl(value: String): String? =
        value.trim().takeIf(UrlExtractor::isHttpsUrl)

    private const val ACTION_SEND = "android.intent.action.SEND"
    private const val MIME_TEXT_PLAIN = "text/plain"
}
