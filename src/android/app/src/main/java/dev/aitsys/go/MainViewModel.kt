package dev.aitsys.go

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.aitsys.go.data.ApiClient
import dev.aitsys.go.data.ApiException
import dev.aitsys.go.data.AppSettings
import dev.aitsys.go.data.Branding
import dev.aitsys.go.data.ConnectionTest
import dev.aitsys.go.data.LinkDraft
import dev.aitsys.go.data.LinkRecord
import dev.aitsys.go.data.SettingsRepository
import dev.aitsys.go.data.ShareMode
import dev.aitsys.go.data.UrlExtractor
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.json.JSONObject

enum class Screen { CREATE, MANAGE, SETTINGS }

data class UiState(
    val loaded: Boolean = false,
    val screen: Screen = Screen.CREATE,
    val settings: AppSettings = AppSettings(),
    val token: String = "",
    val branding: Branding = Branding(),
    val brandingAssetRevision: Long = 0,
    val appLocked: Boolean = false,
    val appLockError: String? = null,
    val draft: LinkDraft = LinkDraft(),
    val links: List<LinkRecord> = emptyList(),
    val nextCursor: String? = null,
    val previousCursors: List<String?> = emptyList(),
    val currentCursor: String? = null,
    val busy: Boolean = false,
    val message: String? = null,
    val error: String? = null,
    val createdUrl: String? = null,
    val clipboardUrl: String? = null,
    val editing: LinkRecord? = null,
    val confirmDisable: LinkRecord? = null,
    val connectionTest: ConnectionTest? = null,
)

class MainViewModel(
    application: Application,
) : AndroidViewModel(application) {
    private val repository = SettingsRepository(application)
    private var loadJob: Job
    private var pendingSharedText: String? = null
    var state by mutableStateOf(UiState())
        private set

    init {
        loadJob =
            viewModelScope.launch {
                val (settings, token) = repository.load()
                val cachedBranding = repository.loadBrandingJson()?.let(::parseBranding) ?: Branding()
                state =
                    state.copy(
                        loaded = true,
                        settings = settings,
                        token = token,
                        branding = cachedBranding,
                        brandingAssetRevision = BrandingAssets.cachedRevision(application, cachedBranding.brandLogoUrl),
                        appLocked = settings.appLockEnabled,
                    )
                viewModelScope.launch { refreshBranding(silent = true) }
            }
    }

    fun navigate(screen: Screen) {
        state = state.copy(screen = screen, error = null, message = null, createdUrl = null)
        if (screen == Screen.MANAGE) loadLinks(null, resetHistory = true)
    }

    fun updateDraft(draft: LinkDraft) {
        state = state.copy(draft = draft, error = null)
    }

    fun dismissNotice() {
        state = state.copy(error = null, message = null)
    }

    fun confirmClipboardWrite(url: String) {
        if (state.clipboardUrl == url) state = state.copy(clipboardUrl = null)
    }

    fun edit(record: LinkRecord?) {
        state = state.copy(editing = record)
    }

    fun confirmDisable(record: LinkRecord?) {
        state = state.copy(confirmDisable = record)
    }

    fun receiveSharedText(text: String?) =
        viewModelScope.launch {
            loadJob.join()
            if (state.appLocked) {
                pendingSharedText = text
                return@launch
            }
            processSharedText(text)
        }

    fun unlock() {
        if (!state.appLocked) return
        state = state.copy(appLocked = false, appLockError = null)
        pendingSharedText?.let { text ->
            pendingSharedText = null
            receiveSharedText(text)
        }
    }

    fun lock() {
        if (!state.settings.appLockEnabled || state.appLocked) return
        state =
            state.copy(
                appLocked = true,
                appLockError = null,
                draft = LinkDraft(),
                links = emptyList(),
                createdUrl = null,
                editing = null,
                confirmDisable = null,
                error = null,
                message = null,
            )
    }

    fun enableAppLock() =
        runAction {
            repository.setAppLockEnabled(true)
            state = state.copy(settings = state.settings.copy(appLockEnabled = true), appLockError = null, message = "App lock enabled.")
        }

    fun disableAppLock() =
        runAction {
            repository.setAppLockEnabled(false)
            state = state.copy(settings = state.settings.copy(appLockEnabled = false), appLockError = null, message = "App lock disabled.")
        }

    fun showAppLockError(message: String) {
        state = if (state.appLocked) state.copy(appLockError = message) else state.copy(error = message)
    }

    private fun processSharedText(text: String?) {
        val url = UrlExtractor.firstHttpsUrl(text)
        if (url == null) {
            state = state.copy(screen = Screen.CREATE, error = "The shared text does not contain an HTTPS URL.")
            return
        }
        val draft = LinkDraft(destinationUrl = url)
        state = state.copy(screen = Screen.CREATE, draft = draft, error = null, createdUrl = null)
        if (state.settings.shareMode == ShareMode.AUTOMATIC) create(draft)
    }

    fun saveSettings(
        apiBase: String,
        token: String,
        shareMode: ShareMode,
    ) = runAction {
        val settings = AppSettings(ApiClient.normalizeOrigin(apiBase), shareMode, state.settings.appLockEnabled)
        repository.save(settings, token)
        state = state.copy(settings = settings, token = token.trim(), message = "Settings saved.")
        refreshBranding(silent = false)
    }

    fun testConnection(
        apiBase: String? = null,
        token: String? = null,
        silent: Boolean = false,
        testAuth: Boolean = false,
    ) = runAction {
        if (testAuth && token.isNullOrEmpty()) {
            state = state.copy(message = "Cannot test auth with no token? You dumb??")
            throw ApiException("Add an issued user token in Settings first.")
        }
        var normalized: String? = null
        if (!apiBase.isNullOrEmpty())
            normalized = ApiClient.normalizeOrigin(apiBase)
        runConnectionTest(normalized, token, silent, testAuth)
    }

    fun create(draft: LinkDraft = state.draft) =
        runAction {
            validateDraft(draft)
            val client = client()
            val record = client.create(draft)
            val shortUrl = client.shortUrl(record.slug)
            state =
                state.copy(
                    draft = LinkDraft(),
                    createdUrl = shortUrl,
                    clipboardUrl = shortUrl,
                    message = "Short link created and copied to the clipboard.",
                )
        }

    fun update(
        record: LinkRecord,
        draft: LinkDraft,
    ) = runAction {
        validateDraft(draft)
        client().update(record.slug, draft)
        state = state.copy(editing = null, message = "${client().shortUrl(record.slug)} updated.")
        fetchLinks(state.currentCursor, resetHistory = false)
    }

    fun refresh(record: LinkRecord) =
        runAction {
            client().refresh(record.slug)
            state = state.copy(message = "Metadata refreshed for ${client().shortUrl(record.slug)}.")
            fetchLinks(state.currentCursor, resetHistory = false)
        }

    fun disable(record: LinkRecord) =
        runAction {
            client().disable(record.slug)
            state = state.copy(confirmDisable = null, message = "${client().shortUrl(record.slug)} disabled.")
            fetchLinks(state.currentCursor, resetHistory = false)
        }

    fun nextPage() {
        val next = state.nextCursor ?: return
        val history = state.previousCursors + state.currentCursor
        state = state.copy(previousCursors = history)
        loadLinks(next, resetHistory = false)
    }

    fun previousPage() {
        if (state.previousCursors.isEmpty()) return
        val target = state.previousCursors.last()
        state = state.copy(previousCursors = state.previousCursors.dropLast(1))
        loadLinks(target, resetHistory = false)
    }

    fun refreshLinks() {
        if (state.screen != Screen.MANAGE || state.busy) return
        loadLinks(state.currentCursor, resetHistory = false)
    }

    fun addBrandedShortcut(): Boolean = BrandingAssets.requestPinnedShortcut(getApplication(), state.branding)

    private fun loadLinks(
        cursor: String?,
        resetHistory: Boolean,
    ) = runAction {
        fetchLinks(cursor, resetHistory)
    }

    private suspend fun fetchLinks(
        cursor: String?,
        resetHistory: Boolean,
    ) {
        var page = client().list(cursor, 25)
        var skippedEmptyPages = 0
        while (page.items.none { it.disabledAt == null } && page.cursor != null && skippedEmptyPages < 10) {
            page = client().list(page.cursor, 25)
            skippedEmptyPages++
        }
        state =
            state.copy(
                links = page.items.filter { it.disabledAt == null },
                nextCursor = page.cursor,
                currentCursor = cursor,
                previousCursors = if (resetHistory) emptyList() else state.previousCursors,
            )
    }

    private suspend fun refreshBranding(silent: Boolean) {
        runCatching { ApiClient(state.settings.apiBase, null).metadata().branding }
            .onSuccess {
                val assetRevision = cacheBranding(it)
                state =
                    state.copy(
                        branding = it,
                        brandingAssetRevision = assetRevision,
                        message = if (silent) state.message else "Branding updated.",
                    )
            }.onFailure { if (!silent) throw it }
    }

    private suspend fun runConnectionTest(
        apiBase: String?,
        token: String?,
        silent: Boolean = false,
        testAuth: Boolean = false,
    ) {
        if (apiBase != null)
            runCatching { ApiClient(apiBase, token).testConnection() }
                .onSuccess {
                    connectionTest ->
                    run {
                        var success = "Failure"
                        if (connectionTest.status == "ok")
                            success = "Successful"
                        if (testAuth)
                            runCatching { ApiClient(apiBase, token).validateAuth() }
                                .onSuccess {
                                    userInfo ->
                                    run {
                                        state = state.copy(
                                            message = if (silent) state.message else "Connection Test Result: $success.\nAuthenticated as ${userInfo.creatorName}.",
                                            connectionTest = connectionTest,
                                        )
                                    }
                                }
                                .onFailure {
                                    state = state.copy(
                                        message = if (silent) state.message else "Connection Test Result: $success.\nToken is invalid!",
                                        connectionTest = connectionTest,
                                    )
                                    throw it
                                }
                        else
                            state = state.copy(
                                message = if (silent) state.message else "Connection Test Result: $success",
                                connectionTest = connectionTest,
                            )
                    }
                }.onFailure { if (!silent) throw it }
        else
            runCatching { client().testConnection() }
                .onSuccess {
                        connectionTest ->
                    run {
                        var success = "Failure"
                        if (connectionTest.status == "ok")
                            success = "Successful"
                        state = state.copy(
                            message = if (silent) state.message else "Connection Test Result: $success",
                            connectionTest = connectionTest,
                        )
                    }
                }.onFailure { if (!silent) throw it }
    }

    private suspend fun cacheBranding(branding: Branding): Long {
        repository.saveBrandingJson(brandingJson(branding).toString())
        BrandingAssets.cache(getApplication(), branding)
        return BrandingAssets.cachedRevision(getApplication(), branding.brandLogoUrl)
    }

    private fun client() = ApiClient(state.settings.apiBase, state.token)

    private fun validateDraft(draft: LinkDraft) {
        require(UrlExtractor.isHttpsUrl(draft.destinationUrl)) { "Destination must be a valid HTTPS URL." }
        if (draft.slug.isNotBlank()) {
            require(Regex("^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$").matches(draft.slug)) {
                "Slug must be 2-64 letters, numbers, underscores, or hyphens."
            }
        }
        if (draft.embedImageUrl.isNotBlank()) require(UrlExtractor.isHttpsUrl(draft.embedImageUrl)) { "Embed image must use HTTPS." }
    }

    private fun runAction(block: suspend () -> Unit) =
        viewModelScope.launch {
            if (state.busy) return@launch
            state = state.copy(busy = true, error = null, message = null)
            try {
                block()
            } catch (error: Exception) {
                val message =
                    when {
                        error is ApiException && error.status == 401 -> "The issued token is invalid or revoked. Update it in Settings."
                        error is java.net.SocketTimeoutException -> "The shortener timed out. Please try again."
                        error.message.isNullOrBlank() -> "Something went wrong."
                        else -> error.message!!
                    }
                state = state.copy(error = message)
            } finally {
                state = state.copy(busy = false)
            }
        }
}

private fun brandingJson(value: Branding) =
    JSONObject().apply {
        put("siteName", value.siteName)
        put("brandLogoUrl", value.brandLogoUrl)
        put("brandLogoAlt", value.brandLogoAlt)
        put("faviconUrl", value.faviconUrl)
        put("brandColor", value.brandColor)
        put("privacyEmail", value.privacyEmail)
    }

private fun parseBranding(value: String): Branding? =
    runCatching {
        val json = JSONObject(value)
        Branding(
            siteName = json.getString("siteName"),
            brandLogoUrl = json.getString("brandLogoUrl"),
            brandLogoAlt = json.getString("brandLogoAlt"),
            faviconUrl = json.getString("faviconUrl"),
            brandColor = json.getString("brandColor"),
            privacyEmail = json.getString("privacyEmail"),
        )
    }.getOrNull()
