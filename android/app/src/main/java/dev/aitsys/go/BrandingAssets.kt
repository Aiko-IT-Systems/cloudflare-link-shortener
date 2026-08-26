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
import android.net.Uri
import dev.aitsys.go.data.Branding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

object BrandingAssets {
    private const val MAX_DOWNLOAD_BYTES = 1_000_000

    suspend fun cache(context: Context, branding: Branding): Bitmap? = withContext(Dispatchers.IO) {
        val target = File(context.filesDir, "branding-icon.png")
        val source = branding.faviconUrl.ifBlank { branding.brandLogoUrl }
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
                val scaled = Bitmap.createScaledBitmap(decoded, 192, 192, true)
                target.outputStream().use { scaled.compress(Bitmap.CompressFormat.PNG, 95, it) }
                scaled
            } finally {
                connection.disconnect()
            }
        }.getOrNull()
    }

    fun cached(context: Context): Bitmap? = BitmapFactory.decodeFile(File(context.filesDir, "branding-icon.png").path)

    fun requestPinnedShortcut(context: Context, branding: Branding): Boolean {
        val manager = context.getSystemService(ShortcutManager::class.java)
        if (!manager.isRequestPinShortcutSupported) return false
        val source = cached(context) ?: fallbackBitmap(branding.brandColor)
        val intent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse("aitsys-go://create")
        }
        val shortcut = ShortcutInfo.Builder(context, "branded-create")
            .setShortLabel(branding.siteName.take(10))
            .setLongLabel("Create with ${branding.siteName}".take(25))
            .setIcon(Icon.createWithBitmap(source))
            .setIntent(intent)
            .build()
        return manager.requestPinShortcut(shortcut, null)
    }

    private fun fallbackBitmap(color: String): Bitmap {
        val bitmap = Bitmap.createBitmap(192, 192, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val parsed = runCatching { Color.parseColor(color) }.getOrDefault(Color.MAGENTA)
        canvas.drawColor(Color.rgb(18, 5, 26))
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = parsed; strokeWidth = 22f; style = Paint.Style.STROKE }
        canvas.drawCircle(72f, 96f, 38f, paint)
        paint.color = Color.rgb(124, 92, 255)
        canvas.drawCircle(120f, 96f, 38f, paint)
        return bitmap
    }
}
