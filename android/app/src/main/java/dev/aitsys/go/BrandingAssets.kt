package dev.aitsys.go

import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.drawable.Icon
import androidx.core.graphics.scale
import androidx.core.net.toUri
import dev.aitsys.go.data.Branding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import androidx.core.graphics.createBitmap
import androidx.core.graphics.toColorInt

object BrandingAssets {
    // Logos are downscaled to 192 px before caching. Allow a modestly larger source
    // file because otherwise valid, ordinary PNG branding such as SMPEarth's 1.85 MB
    // logo is rejected before it reaches that safe cached size.
    private const val MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024

    suspend fun cache(context: Context, branding: Branding): Bitmap? = withContext(Dispatchers.IO) {
        val source = branding.brandLogoUrl
        val target = logoFile(context, source)
        runCatching {
            val connection = URL(source).openConnection() as HttpURLConnection
            try {
                connection.connectTimeout = 8_000
                connection.readTimeout = 12_000
                connection.instanceFollowRedirects = true
                connection.setRequestProperty("Accept", "image/*")
                if (connection.responseCode !in 200..299) return@runCatching null
                if (!connection.url.protocol.equals("https", true)) return@runCatching null
                val declared = connection.contentLengthLong
                if (declared > MAX_DOWNLOAD_BYTES) return@runCatching null
                val bytes = connection.inputStream.use { input ->
                    val buffer = ByteArray(8192)
                    val output = java.io.ByteArrayOutputStream()
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        if (output.size() + read > MAX_DOWNLOAD_BYTES) return@runCatching null
                        output.write(buffer, 0, read)
                    }
                    output.toByteArray()
                }
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                if (bounds.outWidth !in 1..8192 || bounds.outHeight !in 1..8192) return@runCatching null
                var sample = 1
                while (bounds.outWidth / sample > 512 || bounds.outHeight / sample > 512) sample *= 2
                val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
                    ?: return@runCatching null
                val scaled = decoded.scale(192, 192)
                target.outputStream().use { scaled.compress(Bitmap.CompressFormat.PNG, 95, it) }
                scaled
            } finally {
                connection.disconnect()
            }
        }.getOrNull()
    }

    fun cached(context: Context, source: String): Bitmap? = BitmapFactory.decodeFile(logoFile(context, source).path)

    fun cachedRevision(context: Context, source: String): Long = logoFile(context, source).lastModified()

    fun requestPinnedShortcut(context: Context, branding: Branding): Boolean {
        val manager = context.getSystemService(ShortcutManager::class.java)
        if (!manager.isRequestPinShortcutSupported) return false
        val source = cached(context, branding.brandLogoUrl) ?: fallbackBitmap(branding.brandColor)
        val intent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = "aitsys-go://create".toUri()
        }
        val shortcut = ShortcutInfo.Builder(context, "branded-create")
            .setShortLabel(shortcutLabel(branding.siteName))
            .setLongLabel("Create with ${branding.siteName}".take(25))
            .setIcon(Icon.createWithBitmap(source))
            .setIntent(intent)
            .build()
        val alreadyPinned = manager.pinnedShortcuts.any { it.id == shortcut.id }
        manager.updateShortcuts(listOf(shortcut))
        return alreadyPinned || manager.requestPinShortcut(shortcut, null)
    }

    private fun fallbackBitmap(color: String): Bitmap {
        val bitmap = createBitmap(192, 192)
        val canvas = Canvas(bitmap)
        val parsed = runCatching { color.toColorInt() }.getOrDefault(Color.MAGENTA)
        canvas.drawColor(Color.rgb(18, 5, 26))
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = parsed; strokeWidth = 22f; style = Paint.Style.STROKE }
        canvas.drawCircle(72f, 96f, 38f, paint)
        paint.color = Color.rgb(124, 92, 255)
        canvas.drawCircle(120f, 96f, 38f, paint)
        return bitmap
    }

    private fun logoFile(context: Context, source: String): File {
        val digest = MessageDigest.getInstance("SHA-256").digest(source.toByteArray(Charsets.UTF_8))
        val suffix = digest.joinToString("") { byte -> "%02x".format(byte) }
        return File(context.filesDir, "branding-logo-$suffix.png")
    }

    private fun shortcutLabel(siteName: String): String {
        val compact = siteName.filter { it.isLetterOrDigit() }
        return (compact.ifBlank { siteName }.take(10)).ifBlank { "AITSYSGo" }
    }
}
