package dev.aitsys.go.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.net.URL
import java.nio.charset.StandardCharsets

class ApiException(message: String, val status: Int? = null) : IOException(message)

class ApiClient(
    private val baseUrl: String,
    private val token: String,
) {
    private val origin = normalizeOrigin(baseUrl)

    suspend fun metadata(): Branding = request("GET", "/api/v1/metadata", authenticated = false) {
        val root = resultObject(it)
        if (root.optInt("apiVersion") != 1) throw ApiException("This shortener uses an unsupported metadata version.")
        root.getJSONObject("branding").let { branding ->
            Branding(
                siteName = branding.requireText("siteName"),
                brandLogoUrl = branding.requireHttpsUrl("brandLogoUrl"),
                brandLogoAlt = branding.requireText("brandLogoAlt"),
                faviconUrl = branding.requireHttpsUrl("faviconUrl"),
                brandColor = branding.requireText("brandColor"),
                privacyEmail = branding.nullableString("privacyEmail"),
            )
        }
    }

    suspend fun create(draft: LinkDraft): LinkRecord = request("POST", "/api/v1/links", draft.toJson()) {
        resultObject(it).linkRecord()
    }

    suspend fun list(cursor: String? = null, limit: Int = 10): LinkPage {
        val query = buildString {
            append("?limit=").append(limit.coerceIn(1, 50))
            if (!cursor.isNullOrBlank()) append("&cursor=").append(encode(cursor))
        }
        return request("GET", "/api/v1/links$query") {
            val result = resultObject(it)
            val items = result.optJSONArray("items") ?: JSONArray()
            LinkPage(
                items = (0 until items.length()).map { index -> items.getJSONObject(index).linkRecord() },
                cursor = result.nullableString("cursor"),
            )
        }
    }

    suspend fun update(slug: String, draft: LinkDraft): LinkRecord =
        request("PATCH", "/api/v1/links/${encodePath(slug)}", draft.toJson(forUpdate = true)) { resultObject(it).linkRecord() }

    suspend fun refresh(slug: String): LinkRecord =
        request("POST", "/api/v1/links/${encodePath(slug)}/refresh-metadata", JSONObject()) { resultObject(it).linkRecord() }

    suspend fun disable(slug: String): LinkRecord =
        request("POST", "/api/v1/links/${encodePath(slug)}/disable", JSONObject()) { resultObject(it).linkRecord() }

    fun shortUrl(slug: String): String = "$origin/${encodePath(slug)}"

    private suspend fun <T> request(
        method: String,
        path: String,
        body: JSONObject? = null,
        authenticated: Boolean = true,
        read: (JSONObject) -> T,
    ): T = withContext(Dispatchers.IO) {
        if (authenticated && token.isBlank()) throw ApiException("Add an issued user token in Settings first.")
        val connection = URL(origin + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 10_000
            connection.readTimeout = 20_000
            connection.setRequestProperty("Accept", "application/json")
            if (authenticated) connection.setRequestProperty("Authorization", "Bearer ${token.trim()}")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.outputStream.use { it.write(body.toString().toByteArray(StandardCharsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(StandardCharsets.UTF_8)?.use { it.readText() }.orEmpty()
            val json = runCatching { JSONObject(text) }.getOrElse {
                throw ApiException("The shortener returned an invalid response (${status}).", status)
            }
            if (status !in 200..299) {
                val message = json.optJSONArray("errors")?.optJSONObject(0)?.optString("message")
                throw ApiException(message?.takeIf(String::isNotBlank) ?: "Request failed (${status}).", status)
            }
            read(json)
        } finally {
            connection.disconnect()
        }
    }

    private fun resultObject(root: JSONObject): JSONObject =
        root.optJSONObject("result") ?: throw ApiException("The shortener returned an incomplete response.")

    companion object {
        fun normalizeOrigin(value: String): String {
            val uri = runCatching { URI(value.trim()) }.getOrElse { throw IllegalArgumentException("Enter a valid HTTPS API base URL.") }
            require(uri.scheme.equals("https", true) && !uri.host.isNullOrBlank() && uri.userInfo == null) {
                "The API base URL must be an HTTPS origin."
            }
            require(uri.path.isNullOrBlank() || uri.path == "/") { "The API base URL must not contain a path." }
            require(uri.query == null && uri.fragment == null) { "The API base URL must not contain a query or fragment." }
            return URI("https", null, uri.host, uri.port, null, null, null).toString().removeSuffix("/")
        }

        private fun encode(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8.name())
        private fun encodePath(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20")
    }
}

private fun JSONObject.requireText(key: String): String = optString(key).takeIf(String::isNotBlank)
    ?: throw ApiException("Branding metadata is missing $key.")

private fun JSONObject.requireHttpsUrl(key: String): String = requireText(key).also {
    if (!UrlExtractor.isHttpsUrl(it)) throw ApiException("Branding metadata contains an invalid $key.")
}
