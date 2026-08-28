package dev.aitsys.go.data

import android.util.Patterns
import dev.aitsys.go.API_VERSION
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit
import kotlin.String

internal val supportedHttpProtocols = listOf(Protocol.HTTP_2, Protocol.HTTP_1_1)

private val httpClient =
    OkHttpClient.Builder()
        // OkHttp requires HTTP/1.1 as the fallback for normal ALPN negotiation.
        // HTTP/3 is not implemented by this Android OkHttp transport.
        .protocols(supportedHttpProtocols)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .build()

private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

class ApiException(
    message: String,
    val status: Int? = null,
) : IOException(message)

class ApiClient(
    baseUrl: String,
    private val token: String?,
) {
    private val origin = normalizeOrigin(baseUrl)

    suspend fun testConnection(): ConnectionTest =
        request("GET", "/api/$API_VERSION/connection-test", authenticated = false) {
            val root = resultObject(it)
            if (root.optString("status") != "ok") throw ApiException("This shortener appears unhealthy")
            ConnectionTest(
                status = root.requireText("status"),
                apiVersion = root.getInt("apiVersion"),
                checks = root.getJSONObject("checks").let { checks ->
                    ConnectionChecks(
                        configuration = ConfigurationCheck(
                            ok = checks.getJSONObject("configuration").getBoolean("ok")
                        ),
                        kv = checks.getJSONObject("kv").let { kv ->
                            KvCheck(
                                ok = kv.getBoolean("ok"),
                                latencyMs = kv.getInt("latencyMs")
                            )
                        }
                    )
                },
                cloudflare = root.getJSONObject("cloudflare").let { cf ->
                    CloudflareConnection(
                        colo = cf.optString("colo"),
                        country = cf.optString("country"),
                        asn = cf.optInt("asn"),
                        asOrganization = cf.optString("asOrganization"),
                        httpProtocol = cf.optString("httpProtocol"),
                        tlsVersion = cf.optString("tlsVersion")
                    )
                },
                durationMs = root.getInt("durationMs"),
                build =
                    root.getJSONObject("build").let { build ->
                        Build(
                            version = build.requireText("version"),
                            sha = build.requireText("sha"),
                            repository = build.requireHttpsUrl("repository"),
                        )
                    },
            )
        }

    suspend fun validateAuth(): UserInfo =
        request("GET", "/api/$API_VERSION/me", authenticated = true) {
            val root = resultObject(it)
            UserInfo(
                id = root.requireText("id"),
                creatorName = root.requireText("creatorName"),
                createdAt = root.requireText("createdAt"),
                discordUserId = root.nullableString("discordUserId"),
            )
        }

    suspend fun metadata(): Metadata =
        request("GET", "/api/$API_VERSION/metadata", authenticated = false) {
            val root = resultObject(it)
            val expectedVersionInt = API_VERSION.replace("v", "").toInt()
            if (root.optInt("apiVersion") != expectedVersionInt) throw ApiException("This shortener uses an unsupported metadata version.")
            Metadata(
                apiVersion = root.getInt("apiVersion"),
                branding =
                    root.getJSONObject("branding").let { branding ->
                        Branding(
                            siteName = branding.requireText("siteName"),
                            brandLogoUrl = branding.requireHttpsUrl("brandLogoUrl"),
                            brandLogoAlt = branding.requireText("brandLogoAlt"),
                            faviconUrl = branding.requireHttpsUrl("faviconUrl"),
                            brandColor = branding.requireText("brandColor"),
                            privacyEmail = branding.requireEmail("privacyEmail"),
                        )
                    },
                build =
                    root.getJSONObject("build").let { build ->
                        Build(
                            version = build.requireText("version"),
                            sha = build.requireText("sha"),
                            repository = build.requireHttpsUrl("repository"),
                        )
                    },
            )
        }

    suspend fun create(draft: LinkDraft): LinkRecord =
        request("POST", "/api/$API_VERSION/links", draft.toJson()) {
            resultObject(it).linkRecord()
        }

    suspend fun list(
        cursor: String? = null,
        limit: Int = 10,
    ): LinkPage {
        val query =
            buildString {
                append("?limit=").append(limit.coerceIn(1, 50))
                if (!cursor.isNullOrBlank()) append("&cursor=").append(encode(cursor))
            }
        return request("GET", "/api/$API_VERSION/links$query") {
            val result = resultObject(it)
            val items = result.optJSONArray("items") ?: JSONArray()
            LinkPage(
                items = (0 until items.length()).map { index -> items.getJSONObject(index).linkRecord() },
                cursor = result.nullableString("cursor"),
            )
        }
    }

    suspend fun update(
        slug: String,
        draft: LinkDraft,
    ): LinkRecord = request("PATCH", "/api/$API_VERSION/links/${encodePath(slug)}", draft.toJson(forUpdate = true)) { resultObject(it).linkRecord() }

    suspend fun refresh(slug: String): LinkRecord =
        request("POST", "/api/$API_VERSION/links/${encodePath(slug)}/refresh-metadata", JSONObject()) { resultObject(it).linkRecord() }

    suspend fun disable(slug: String): LinkRecord =
        request("POST", "/api/$API_VERSION/links/${encodePath(slug)}/disable", JSONObject()) { resultObject(it).linkRecord() }

    fun shortUrl(slug: String): String = "$origin/${encodePath(slug)}"

    private suspend fun <T> request(
        method: String,
        path: String,
        body: JSONObject? = null,
        authenticated: Boolean = true,
        read: (JSONObject) -> T,
    ): T =
        withContext(Dispatchers.IO) {
            val authorizationToken =
                if (authenticated) {
                    normalizeToken(token.orEmpty()).takeIf(String::isNotBlank)
                        ?: throw ApiException("Add an issued user token in Settings first.")
                } else {
                    null
                }

            val requestBody = body?.toString()?.toRequestBody(jsonMediaType)
            val requestBuilder =
                Request.Builder()
                    .url(origin + path)
                    .header("Accept", "application/json")
                    .method(method, requestBody)
            if (authorizationToken != null) {
                requestBuilder.header("Authorization", "Bearer $authorizationToken")
            }

            httpClient.newCall(requestBuilder.build()).execute().use { response ->
                val status = response.code
                val text = response.body.string()
                val json =
                    runCatching {
                        JSONObject(text)
                    }.getOrElse {
                        throw ApiException(
                            "The shortener returned an invalid response ($status).",
                            status,
                        )
                    }

                if (status !in 200..299) {
                    val message =
                        json
                            .optJSONArray("errors")
                            ?.optJSONObject(0)
                            ?.optString("message")

                    throw ApiException(
                        message?.takeIf(String::isNotBlank)
                            ?: "Request failed ($status).",
                        status,
                    )
                }

                read(json)
            }
        }

    private fun resultObject(root: JSONObject): JSONObject =
        root.optJSONObject("result") ?: throw ApiException("The shortener returned an incomplete response.")

    companion object {
        fun normalizeToken(value: String): String =
            value.trim().also { normalized ->
                require(normalized.none(Char::isWhitespace)) {
                    "The issued user token cannot contain spaces or line breaks."
                }
            }

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

private fun JSONObject.requireText(key: String): String =
    optString(key).takeIf(String::isNotBlank)
        ?: throw ApiException("Response is missing $key.")

private fun JSONObject.requireHttpsUrl(key: String): String =
    requireText(key).also {
        if (!UrlExtractor.isHttpsUrl(it)) throw ApiException("Response contains an invalid $key.")
    }

private fun JSONObject.requireEmail(key: String): String =
    requireText(key).trim().also {
        if (it.length > 254 ||
            !Patterns.EMAIL_ADDRESS.matcher(it).matches()
        ) {
            throw ApiException("Response contains an invalid $key.")
        }
    }
