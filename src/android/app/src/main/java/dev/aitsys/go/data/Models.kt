package dev.aitsys.go.data

import org.json.JSONObject

enum class ShareMode { CONFIGURE, AUTOMATIC }

data class AppSettings(
    val apiBase: String = "https://go.aitsys.dev",
    val shareMode: ShareMode = ShareMode.CONFIGURE,
    val appLockEnabled: Boolean = false,
)

data class UserInfo(
    val id: String,
    val creatorName: String,
    val createdAt: String,
    val discordUserId: String? = null,
)

data class ConnectionTest(
    val status: String,
    val apiVersion: Int,
    val checks: ConnectionChecks,
    val cloudflare: CloudflareConnection?,
    val durationMs: Int,
    val build: Build,
)

data class ConnectionChecks(
    val configuration: ConfigurationCheck,
    val kv: KvCheck,
)

data class ConfigurationCheck(
    val ok: Boolean,
)

data class KvCheck(
    val ok: Boolean,
    val latencyMs: Int,
)

data class CloudflareConnection(
    val colo: String?,
    val country: String?,
    val asn: Int?,
    val asOrganization: String?,
    val httpProtocol: String?,
    val tlsVersion: String?,
)

data class Metadata(
    val apiVersion: Int,
    val branding: Branding,
    val build: Build,
)

data class Build(
    val version: String,
    val sha: String,
    val repository: String,
)

data class Branding(
    val siteName: String = "AITSYS Go",
    val brandLogoUrl: String = "/logo.png",
    val brandLogoAlt: String = "Aiko IT Systems",
    val faviconUrl: String = "/favicon.png",
    val brandColor: String = "#FC0FC0",
    val privacyEmail: String = "privacy@aitsys.dev",
)

data class LinkRecord(
    val slug: String,
    val destinationUrl: String,
    val creator: String = "",
    val createdAt: String = "",
    val title: String? = null,
    val embedTitle: String? = null,
    val embedDescription: String? = null,
    val embedImageUrl: String? = null,
    val embedSiteName: String? = null,
    val password: String? = null,
    val expiresAt: String? = null,
    val suppressSocialPreview: Boolean = false,
    val disabledAt: String? = null,
)

data class LinkPage(
    val items: List<LinkRecord>,
    val cursor: String?,
)

data class LinkDraft(
    val destinationUrl: String = "",
    val slug: String = "",
    val title: String = "",
    val password: String = "",
    val expiresAt: String = "",
    val suppressSocialPreview: Boolean = false,
    val embedTitle: String = "",
    val embedDescription: String = "",
    val embedImageUrl: String = "",
    val embedSiteName: String = "",
) {
    fun toJson(forUpdate: Boolean = false): JSONObject =
        JSONObject().apply {
            put("destinationUrl", destinationUrl.trim())
            if (!forUpdate && slug.isNotBlank()) put("slug", slug.trim())
            putOptional("title", title, forUpdate)
            putOptional("password", password, forUpdate)
            putOptional("expiresAt", expiresAt, forUpdate)
            put("suppressSocialPreview", suppressSocialPreview)
            putOptional("embedTitle", embedTitle, forUpdate)
            putOptional("embedDescription", embedDescription, forUpdate)
            putOptional("embedImageUrl", embedImageUrl, forUpdate)
            putOptional("embedSiteName", embedSiteName, forUpdate)
        }

    private fun JSONObject.putOptional(
        key: String,
        value: String,
        includeEmpty: Boolean,
    ) {
        if (value.isNotBlank()) {
            put(key, value.trim())
        } else if (includeEmpty) {
            put(key, JSONObject.NULL)
        }
    }
}

object UrlExtractor {
    private val httpsUrl = Regex("https://[^\\s<>\\[\\]{}\"']+", RegexOption.IGNORE_CASE)
    private val trailingPunctuation = charArrayOf('.', ',', ';', ':', '!', '?', ')')

    fun firstHttpsUrl(text: String?): String? {
        val candidate = httpsUrl.find(text.orEmpty())?.value?.trimEnd(*trailingPunctuation) ?: return null
        return runCatching {
            val uri = java.net.URI(candidate)
            candidate.takeIf { uri.scheme.equals("https", true) && !uri.host.isNullOrBlank() }
        }.getOrNull()
    }

    fun isHttpsUrl(value: String): Boolean = firstHttpsUrl(value.trim()) == value.trim()
}

internal fun JSONObject.linkRecord(): LinkRecord =
    LinkRecord(
        slug = getString("slug"),
        destinationUrl = getString("destinationUrl"),
        creator = optString("creator"),
        createdAt = optString("createdAt"),
        title = nullableString("title"),
        embedTitle = nullableString("embedTitle"),
        embedDescription = nullableString("embedDescription"),
        embedImageUrl = nullableString("embedImageUrl"),
        embedSiteName = nullableString("embedSiteName"),
        password = nullableString("password"),
        expiresAt = nullableString("expiresAt"),
        suppressSocialPreview = optBoolean("suppressSocialPreview"),
        disabledAt = nullableString("disabledAt"),
    )

internal fun JSONObject.nullableString(key: String): String? =
    if (has(key) && !isNull(key)) optString(key).takeIf(String::isNotBlank) else null
