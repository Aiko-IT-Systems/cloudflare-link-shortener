package dev.aitsys.go

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.icu.text.RelativeDateTimeFormatter
import android.icu.text.RelativeDateTimeFormatter.Direction
import android.icu.text.RelativeDateTimeFormatter.RelativeUnit
import android.net.Uri
import android.text.format.DateFormat
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TimePickerDialog
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.core.graphics.toColorInt
import androidx.core.net.toUri
import coil3.compose.AsyncImage
import dev.aitsys.go.data.Branding
import dev.aitsys.go.data.LinkDraft
import dev.aitsys.go.data.LinkRecord
import dev.aitsys.go.data.ShareMode
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import java.time.Instant
import java.time.LocalDateTime
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.abs
import kotlin.time.Duration.Companion.milliseconds

private val DarkBackground = Color(0xFF12051A)
private val DarkSurface = Color(0xFF21102B)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AitsysGoApp(
    model: MainViewModel,
    requestUnlock: () -> Unit,
    requestEnableAppLock: () -> Unit,
    flexibleUpdateReady: Boolean,
    installFlexibleUpdate: () -> Unit,
    dismissFlexibleUpdate: () -> Unit,
) {
    val state = model.state
    val context = LocalContext.current
    val brand = parseBrandColor(state.branding.brandColor)
    val colors =
        androidx.compose.material3.darkColorScheme(
            primary = brand,
            secondary = Color(0xFF9A7CFF),
            background = DarkBackground,
            surface = DarkSurface,
            error = Color(0xFFFF6B8A),
        )
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(state.error, state.message) {
        (state.error ?: state.message)?.let { snackbar.showSnackbar(it) }
        if (state.error != null || state.message != null) model.dismissNotice()
    }
    LaunchedEffect(state.clipboardUrl) {
        state.clipboardUrl?.let { url ->
            copy(context, url)
            model.confirmClipboardWrite(url)
        }
    }

    MaterialTheme(colorScheme = colors) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            when {
                !state.loaded -> {
                    Box(Modifier.fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
                }

                state.appLocked -> {
                    AppLockScreen(state, requestUnlock)
                }

                else -> {
                    Scaffold(
                        containerColor = MaterialTheme.colorScheme.background,
                        snackbarHost = { SnackbarHost(snackbar) },
                        topBar = {
                            TopAppBar(
                                title = {
                                    BrandHeader(
                                        state.branding,
                                        state.brandingAssetRevision,
                                    )
                                },
                                colors = TopAppBarDefaults.topAppBarColors(containerColor = DarkBackground),
                            )
                        },
                        bottomBar = {
                            NavigationBar(containerColor = DarkSurface) {
                                NavigationBarItem(state.screen == Screen.CREATE, {
                                    model.navigate(Screen.CREATE)
                                }, { Icon(Icons.Default.Add, null) }, label = { Text("Create") })
                                NavigationBarItem(state.screen == Screen.MANAGE, {
                                    model.navigate(Screen.MANAGE)
                                }, { Icon(Icons.Default.Link, null) }, label = { Text("Manage") })
                                NavigationBarItem(
                                    state.screen == Screen.SETTINGS,
                                    {
                                        model.navigate(Screen.SETTINGS)
                                    },
                                    { Icon(Icons.Default.Settings, null) },
                                    label = { Text("Settings") },
                                )
                            }
                        },
                    ) { padding ->
                        Box(Modifier.fillMaxSize().padding(padding)) {
                            when (state.screen) {
                                Screen.CREATE -> {
                                    CreateScreen(state, model, context)
                                }

                                Screen.MANAGE -> {
                                    ManageScreen(state, model, context)
                                }

                                Screen.SETTINGS -> {
                                    SettingsScreen(
                                        state,
                                        model,
                                        requestEnableAppLock,
                                    )
                                }
                            }
                            if (state.busy) {
                                Surface(
                                    color = Color.Black.copy(alpha = .38f),
                                    modifier = Modifier.fillMaxSize(),
                                ) {
                                    Box(Modifier.fillMaxSize()) {
                                        CircularProgressIndicator(
                                            Modifier.align(
                                                Alignment.Center,
                                            ),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (!state.appLocked) state.editing?.let { EditDialog(it, model) }
        if (!state.appLocked) {
            state.confirmDisable?.let { record ->
                AlertDialog(
                    onDismissRequest = { model.confirmDisable(null) },
                    title = { Text("Disable ${record.slug}?") },
                    text = { Text("The short URL will stop redirecting. This cannot be undone from the app.") },
                    confirmButton = { Button(onClick = { model.disable(record) }) { Text("Disable") } },
                    dismissButton = { TextButton(onClick = { model.confirmDisable(null) }) { Text("Cancel") } },
                )
            }
        }
        if (!state.appLocked && flexibleUpdateReady) {
            AlertDialog(
                onDismissRequest = dismissFlexibleUpdate,
                title = { Text("Update ready") },
                text = { Text("Google Play has downloaded an AITSYS Go update. Restart the app to install it now?") },
                confirmButton = { Button(onClick = installFlexibleUpdate) { Text("Restart and install") } },
                dismissButton = { TextButton(onClick = dismissFlexibleUpdate) { Text("Later") } },
            )
        }
    }
}

@Composable
private fun AppLockScreen(
    state: UiState,
    requestUnlock: () -> Unit,
) {
    Column(
        Modifier.fillMaxSize().padding(28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            state.branding.siteName,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(12.dp))
        Text("App locked", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(8.dp))
        Text(
            "Unlock with biometrics or your device screen lock.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        state.appLockError?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(24.dp))
        Button(requestUnlock) { Text("Unlock") }
    }
}

@Composable
private fun BrandHeader(
    branding: Branding,
    assetRevision: Long,
) {
    val context = LocalContext.current
    val bitmap =
        remember(branding.brandLogoUrl, assetRevision) {
            BrandingAssets.cached(
                context,
                branding.brandLogoUrl,
            )
        }
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (bitmap != null) {
            Image(bitmap.asImageBitmap(), branding.brandLogoAlt, Modifier.size(32.dp))
            Spacer(Modifier.width(10.dp))
        }
        Column {
            Text(branding.siteName, fontWeight = FontWeight.Bold)
            Text(
                "Android",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun CreateScreen(
    state: UiState,
    model: MainViewModel,
    context: Context,
) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            "Create a short link",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
        )
        if (state.token.isBlank()) SetupCard { model.navigate(Screen.SETTINGS) }
        LinkForm(state.draft, model::updateDraft)
        Button(
            onClick = { model.create() },
            enabled = !state.busy && state.token.isNotBlank() && state.draft.destinationUrl.isNotBlank(),
            modifier = Modifier.fillMaxWidth().height(52.dp),
        ) { Text("Create short link") }
        state.createdUrl?.let { url -> ResultCard(url, context) }
    }
}

@Composable
private fun SetupCard(openSettings: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Connect your account", fontWeight = FontWeight.Bold)
            Text("Add a revocable issued user token before creating or managing links.")
            OutlinedButton(openSettings) { Text("Open settings") }
        }
    }
}

@Composable
private fun LinkForm(
    draft: LinkDraft,
    update: (LinkDraft) -> Unit,
    showSlug: Boolean = true,
) {
    var advanced by remember { mutableStateOf(false) }
    OutlinedTextField(
        draft.destinationUrl,
        {
            update(draft.copy(destinationUrl = it))
        },
        label = { Text("Destination URL") },
        supportingText = { Text("HTTPS only") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    if (showSlug) {
        OutlinedTextField(
            draft.slug,
            {
                update(draft.copy(slug = it))
            },
            label = { Text("Custom slug (optional)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
    }
    OutlinedTextField(
        draft.title,
        {
            update(draft.copy(title = it))
        },
        label = { Text("Fallback title (optional)") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        draft.password,
        {
            update(draft.copy(password = it))
        },
        label = {
            Text("Password (optional)")
        },
        visualTransformation = PasswordVisualTransformation(),
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    ExpiryDateTimeField(
        value = draft.expiresAt,
        onValueChange = { update(draft.copy(expiresAt = it)) },
        modifier = Modifier.fillMaxWidth(),
    )
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(draft.suppressSocialPreview, { update(draft.copy(suppressSocialPreview = it)) })
        Text("Suppress social preview")
    }
    TextButton(onClick = {
        advanced = !advanced
    }) { Text(if (advanced) "Hide manual metadata" else "Manual metadata") }
    if (advanced) {
        OutlinedTextField(draft.embedTitle, {
            update(draft.copy(embedTitle = it))
        }, label = { Text("Embed title") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(draft.embedDescription, {
            update(draft.copy(embedDescription = it))
        }, label = { Text("Embed description") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(draft.embedImageUrl, {
            update(draft.copy(embedImageUrl = it))
        }, label = { Text("Embed image URL") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(draft.embedSiteName, {
            update(draft.copy(embedSiteName = it))
        }, label = { Text("Embed site name") }, modifier = Modifier.fillMaxWidth())
    }
}

private fun parseExpiry(value: String): ZonedDateTime? {
    if (value.isBlank()) return null
    val zone = ZoneId.systemDefault()
    return runCatching {
        Instant.parse(value).atZone(zone)
    }.recoverCatching {
        OffsetDateTime.parse(value).atZoneSameInstant(zone)
    }.getOrNull()
}

private fun expiryLabel(value: String): String =
    parseExpiry(value)
        ?.format(DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM))
        ?: value

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ExpiryDateTimeField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var pickerStep by remember { mutableStateOf<ExpiryPickerStep?>(null) }
    var selectedDate by remember { mutableStateOf<LocalDate?>(null) }
    val initial =
        remember(value) {
            parseExpiry(value)
                ?: ZonedDateTime
                    .now()
                    .plusHours(1)
                    .withSecond(0)
                    .withNano(0)
        }

    if (pickerStep == ExpiryPickerStep.DATE) {
        val datePickerState =
            rememberDatePickerState(
                initialSelectedDateMillis =
                    initial
                        .toLocalDate()
                        .atStartOfDay(ZoneOffset.UTC)
                        .toInstant()
                        .toEpochMilli(),
            )
        DatePickerDialog(
            onDismissRequest = { pickerStep = null },
            confirmButton = {
                TextButton(
                    onClick = {
                        selectedDate =
                            datePickerState.selectedDateMillis
                                ?.let(Instant::ofEpochMilli)
                                ?.atZone(ZoneOffset.UTC)
                                ?.toLocalDate()
                        pickerStep = ExpiryPickerStep.TIME
                    },
                    enabled = datePickerState.selectedDateMillis != null,
                ) {
                    Text("Next")
                }
            },
            dismissButton = {
                TextButton(onClick = { pickerStep = null }) {
                    Text("Cancel")
                }
            },
        ) {
            DatePicker(state = datePickerState)
        }
    }

    if (pickerStep == ExpiryPickerStep.TIME) {
        val timePickerState =
            rememberTimePickerState(
                initialHour = initial.hour,
                initialMinute = initial.minute,
                is24Hour = DateFormat.is24HourFormat(context),
            )
        TimePickerDialog(
            onDismissRequest = { pickerStep = null },
            title = { Text("Choose time") },
            confirmButton = {
                TextButton(
                    onClick = {
                        val selected =
                            LocalDateTime
                                .of(
                                    selectedDate ?: initial.toLocalDate(),
                                    java.time.LocalTime.of(timePickerState.hour, timePickerState.minute),
                                ).atZone(ZoneId.systemDefault())
                        onValueChange(selected.toInstant().toString())
                        pickerStep = null
                    },
                ) {
                    Text("Save")
                }
            },
            dismissButton = {
                TextButton(onClick = { pickerStep = null }) {
                    Text("Cancel")
                }
            },
        ) {
            TimePicker(state = timePickerState)
        }
    }

    OutlinedTextField(
        value = expiryLabel(value),
        onValueChange = {},
        label = { Text("Expiry (optional)") },
        supportingText = {
            Text("Choose local date and time; saved as UTC.")
        },
        readOnly = true,
        singleLine = true,
        trailingIcon = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (value.isNotBlank()) {
                    IconButton(onClick = { onValueChange("") }) {
                        Icon(
                            Icons.Default.Close,
                            contentDescription = "Clear expiry",
                        )
                    }
                }
                IconButton(
                    onClick = {
                        pickerStep = ExpiryPickerStep.DATE
                    },
                ) {
                    Icon(
                        Icons.Default.DateRange,
                        contentDescription = "Choose expiry date and time",
                    )
                }
            }
        },
        modifier = modifier,
    )
}

private enum class ExpiryPickerStep { DATE, TIME }

@Composable
private fun ResultCard(
    url: String,
    context: Context,
) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                "Created",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
            )
            Text(url, style = MaterialTheme.typography.bodyLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                IconButton({ copy(context, url) }) { Icon(Icons.Default.ContentCopy, "Copy") }
                IconButton({ open(context, url) }) { Icon(Icons.Default.OpenInBrowser, "Open") }
                IconButton({ share(context, url) }) { Icon(Icons.Default.Share, "Share") }
            }
        }
    }
}

@Composable
private fun ManageScreen(
    state: UiState,
    model: MainViewModel,
    context: Context,
) {
    PullToRefreshBox(
        isRefreshing = state.busy,
        onRefresh = model::refreshLinks,
        modifier = Modifier.fillMaxSize(),
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Your active links",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            if (state.token.isBlank()) {
                SetupCard { model.navigate(Screen.SETTINGS) }
            }
            if (state.links.isEmpty() && !state.busy) {
                Text(
                    "No active links on this page.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            state.links.forEach {
                LinkCard(it, state.settings.apiBase, model, context)
            }
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                OutlinedButton(
                    model::previousPage,
                    enabled = state.previousCursors.isNotEmpty() && !state.busy,
                ) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, null)
                    Text("Previous")
                }
                OutlinedButton(
                    model::nextPage,
                    enabled = state.nextCursor != null && !state.busy,
                ) {
                    Text("Next")
                    Icon(Icons.AutoMirrored.Filled.ArrowForward, null)
                }
            }
        }
    }
}

@Composable
private fun LinkCard(
    record: LinkRecord,
    apiBase: String,
    model: MainViewModel,
    context: Context,
) {
    val shortUrl = "${apiBase.trimEnd('/')}/${Uri.encode(record.slug)}"
    LinkCardContent(
        record = record,
        shortUrl = shortUrl,
        onOpen = { open(context, shortUrl) },
        onCopy = { copy(context, shortUrl) },
        onShare = { share(context, shortUrl) },
        onEdit = { model.edit(record) },
        onRefresh = { model.refresh(record) },
        onDisable = { model.confirmDisable(record) },
    )
}

@Composable
private fun LinkCardContent(
    record: LinkRecord,
    shortUrl: String,
    onOpen: () -> Unit,
    onCopy: () -> Unit,
    onShare: () -> Unit,
    onEdit: () -> Unit,
    onRefresh: () -> Unit,
    onDisable: () -> Unit,
) {
    Card {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val previewMode = LocalInspectionMode.current
            val fallbackPainter = rememberVectorPainter(Icons.Default.Image)

            if (!record.embedImageUrl.isNullOrEmpty()) {
                AsyncImage(
                    model =
                        if (previewMode) {
                            // TODO: COMMENT OUT BEFORE PUSH
                            //R.drawable.preview_embed_image
                        } else {
                            record.embedImageUrl
                        },
                    contentDescription = record.embedTitle ?: "Link preview image",
                    contentScale = ContentScale.Crop,
                    placeholder = fallbackPainter,
                    error = fallbackPainter,
                    fallback = fallbackPainter,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp)
                            .heightIn(max = 180.dp)
                            .clip(MaterialTheme.shapes.medium),
                )
            }
            Text(
                record.title ?: record.embedTitle ?: record.destinationUrl,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                color = Color.White,
            )
            if (!record.embedDescription.isNullOrEmpty()) {
                Text(
                    record.embedDescription,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White,
                )
            }
            HorizontalDivider()
            Text(
                "Url: $shortUrl",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontStyle = FontStyle.Italic,
            )
            Text(
                "Target: " + record.destinationUrl,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontStyle = FontStyle.Italic,
            )
            val creation = rememberRelativeCreationDate(record.createdAt)
            if (creation.isNotEmpty()) {
                Text(
                    text = "Created: $creation (" + record.createdAt + ")",
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontStyle = FontStyle.Italic,
                )
            }
            if (!record.expiresAt.isNullOrEmpty()) {
                val expiry = rememberRelativeExpiryDate(record.expiresAt)
                if (expiry.isNotEmpty()) {
                    Text(
                        text = "Expires: $expiry (" + record.expiresAt + ")",
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontStyle = FontStyle.Italic,
                    )
                }
            }
            if (!record.password.isNullOrEmpty()) {
                Text(
                    "Password Protected",
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.Yellow,
                    fontStyle = FontStyle.Italic,
                )
            }
            Text(
                "Author: " + record.creator,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontStyle = FontStyle.Italic,
            )
            HorizontalDivider()
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                IconButton(onOpen) { Icon(Icons.Default.OpenInBrowser, "Open", tint = Color.Magenta) }
                IconButton(onCopy) { Icon(Icons.Default.ContentCopy, "Copy", tint = Color.LightGray) }
                IconButton(onShare) { Icon(Icons.Default.Share, "Share", tint = Color.Gray) }
                IconButton(onEdit) { Icon(Icons.Default.Edit, "Edit", tint = Color.Yellow) }
                IconButton(onRefresh) { Icon(Icons.Default.Refresh, "Refresh metadata", tint = Color.Yellow) }
                IconButton(onDisable) { Icon(Icons.Default.DeleteOutline, "Disable", tint = Color.Red) }
            }
        }
    }
}

@Composable
private fun SettingsScreen(
    state: UiState,
    model: MainViewModel,
    requestEnableAppLock: () -> Unit,
) {
    LaunchedEffect(state.settings.apiBase) {
        while (isActive) {
            model.testConnection(silent = true).join()
            delay((5 * 60 * 1000L).milliseconds)
        }
    }
    var apiBase by remember(state.settings.apiBase) { mutableStateOf(state.settings.apiBase) }
    var token by remember(state.token) { mutableStateOf(state.token) }
    var shareMode by remember(state.settings.shareMode) { mutableStateOf(state.settings.shareMode) }
    val uriHandler = LocalUriHandler.current
    val context = LocalContext.current
    val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
    val versionName = tryGetVersionName(packageInfo.versionName)
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            "Settings",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
        )
        OutlinedTextField(
            apiBase,
            {
                apiBase = it
            },
            label = {
                Text("Shortener API base URL")
            },
            supportingText = { Text("Exact HTTPS origin") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            token,
            {
                token = it
            },
            label = {
                Text("Issued user token")
            },
            visualTransformation = PasswordVisualTransformation(),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Text("Share behavior", fontWeight = FontWeight.Bold)
        ShareChoice("Configure before creating", ShareMode.CONFIGURE, shareMode) { shareMode = it }
        ShareChoice(
            "Create automatically, then show the result",
            ShareMode.AUTOMATIC,
            shareMode,
        ) { shareMode = it }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button({ model.saveSettings(apiBase, token, shareMode) }) { Text("Save") }
            OutlinedButton({ model.testConnection(apiBase, token, silent = false, testAuth = true) }) { Text("Test connection") }
        }
        HorizontalDivider()
        Text("Privacy", fontWeight = FontWeight.Bold)
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Lock app with biometrics")
            Text(
                "On return, require biometrics or your device PIN, pattern, or password before showing link data or handling shared links.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Switch(
                checked = state.settings.appLockEnabled,
                onCheckedChange = { enabled -> if (enabled) requestEnableAppLock() else model.disableAppLock() },
            )
        }
        HorizontalDivider()
        Text("Branding", fontWeight = FontWeight.Bold)
        Text(
            "${state.branding.siteName} · ${state.branding.brandLogoAlt}",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedButton({ model.addBrandedShortcut() }) { Text("Add branded home shortcut") }
        HorizontalDivider()
        Text("About", fontWeight = FontWeight.Bold)
        Row {
            Column {
                Text("Version:", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("Host:", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("API Version:", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("Privacy Contact:", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("Privacy Policy:", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.width(8.dp))
            Column {
                Text(
                    versionName,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.Blue,
                    textDecoration = TextDecoration.Underline,
                    modifier = Modifier.clickable {
                        uriHandler.openUri("https://github.com/Aiko-IT-Systems/cloudflare-link-shortener/releases/tag/$versionName")
                    },
                )
                Text(
                    apiBase,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.Blue,
                    textDecoration = TextDecoration.Underline,
                    modifier = Modifier.clickable {
                        uriHandler.openUri(apiBase)
                    },
                )
                Text(
                    API_VERSION,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    state.branding.privacyEmail,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.Blue,
                    textDecoration = TextDecoration.Underline,
                    modifier = Modifier.clickable {
                        uriHandler.openUri("mailto:" + state.branding.privacyEmail)
                    },
                )
                Text(
                    "$apiBase/privacy",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.Blue,
                    textDecoration = TextDecoration.Underline,
                    modifier = Modifier.clickable {
                        uriHandler.openUri("$apiBase/privacy")
                    },
                )
            }
        }
        HorizontalDivider()
        Text("Debug Information", fontWeight = FontWeight.Bold)
        val connection = state.connectionTest
        val build = connection?.build
        val repositoryUrl = build?.repository?.let(IntentSecurity::normalizedHttpsUrl)

        val shortSha =
            build?.sha
                ?.takeIf(String::isNotBlank)
                ?.take(7)
                ?: "Meow?"

        val repositoryLabel =
            repositoryUrl
                ?.toUri()
                ?.pathSegments
                ?.takeLast(2)
                ?.joinToString("/")
                ?.takeIf(String::isNotBlank)
                ?: "Meow?"

        val latency =
            connection?.durationMs
                ?.let { "${it}ms" }
                ?: "Meow?"

        val protocols =
            listOfNotNull(
                connection?.cloudflare?.httpProtocol,
                connection?.cloudflare?.tlsVersion,
            ).takeIf { it.isNotEmpty() }
                ?.joinToString(" | ")
                ?: "Meow?"

        val debugText =
            """
    API Status: ${connection?.status ?: "Meow?"}
    API Version: ${connection?.apiVersion ?: "Meow?"}
    Server Version: ${build?.version ?: "Meow?"}
    Build SHA: ${build?.sha ?: "Meow?"}
    Repository: ${repositoryUrl ?: "Meow?"}
    Latency: $latency
    Cloudflare Colo: ${connection?.cloudflare?.colo ?: "Meow?"}
    Protocols: $protocols
    """.trimIndent()

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clickable {
                    copy(
                        context = context,
                        text = debugText,
                        label = "AITSYS Go - Debug Information"
                    )
                },
            verticalArrangement = Arrangement.spacedBy(3.dp)
        ) {
            DebugRow("API Status:", connection?.status ?: "Meow?")
            DebugRow("API Version:", connection?.apiVersion?.toString() ?: "Meow?")
            DebugRow("Server Version:", build?.version ?: "Meow?")
            DebugRow("Build SHA:", shortSha)
            DebugRow(
                label = "Repository:",
                value = repositoryLabel,
                onClick = repositoryUrl?.let { url ->
                    { uriHandler.openUri(url) }
                },
            )
            DebugRow("Latency:", latency)
            DebugRow("Cloudflare Colo:", connection?.cloudflare?.colo ?: "Meow?")
            DebugRow("Protocols:", protocols)
        }
    }
}

@Composable
private fun DebugRow(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(120.dp),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color =
                if (onClick != null) {
                    MaterialTheme.colorScheme.primary
                } else {
                    Color.LightGray
                },
            modifier =
                Modifier
                    .weight(1f)
                    .then(
                        if (onClick != null) {
                            Modifier.clickable(onClick = onClick)
                        } else {
                            Modifier
                        },
                    ),
        )
    }
}

@Composable
private fun tryGetVersionName(
    version: String?
): String {
    if (version.isNullOrEmpty())
        return "development"
    if (!version.contains("v", true))
        return "v$version"
    return version
}

@Composable
private fun ShareChoice(
    label: String,
    value: ShareMode,
    selected: ShareMode,
    choose: (ShareMode) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        RadioButton(selected == value, { choose(value) })
        Text(label)
    }
}

@Composable
private fun EditDialog(
    record: LinkRecord,
    model: MainViewModel,
) {
    var draft by remember(record.slug) {
        mutableStateOf(
            LinkDraft(
                destinationUrl = record.destinationUrl,
                slug = record.slug,
                title = record.title.orEmpty(),
                password = record.password.orEmpty(),
                expiresAt = record.expiresAt.orEmpty(),
                suppressSocialPreview = record.suppressSocialPreview,
                embedTitle = record.embedTitle.orEmpty(),
                embedDescription = record.embedDescription.orEmpty(),
                embedImageUrl = record.embedImageUrl.orEmpty(),
                embedSiteName = record.embedSiteName.orEmpty(),
            ),
        )
    }
    AlertDialog(
        onDismissRequest = { model.edit(null) },
        title = { Text("Edit ${record.slug}") },
        text = {
            Column(
                Modifier.verticalScroll(rememberScrollState()).height(430.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                LinkForm(draft, { draft = it }, showSlug = false)
            }
        },
        confirmButton = { Button({ model.update(record, draft) }) { Text("Save") } },
        dismissButton = { TextButton({ model.edit(null) }) { Text("Cancel") } },
    )
}

private fun parseBrandColor(value: String): Color = runCatching { Color(value.toColorInt()) }.getOrDefault(Color(0xFFFC0FC0))

private fun copy(
    context: Context,
    text: String,
    label: String = "Short Url",
) {
    context
        .getSystemService(ClipboardManager::class.java)
        .setPrimaryClip(ClipData.newPlainText(label, text))
}

private fun open(
    context: Context,
    url: String,
) {
    val safeUrl = IntentSecurity.normalizedHttpsUrl(url) ?: return
    runCatching {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, safeUrl.toUri()).apply {
                addCategory(Intent.CATEGORY_BROWSABLE)
            },
        )
    }
}

private fun share(
    context: Context,
    url: String,
) {
    val safeUrl = IntentSecurity.normalizedHttpsUrl(url) ?: return
    runCatching {
        context.startActivity(
            Intent.createChooser(
                Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, safeUrl)
                },
                "Share short link",
            ),
        )
    }
}

@Composable
fun rememberRelativeExpiryDate(expiresAt: String?): String {
    if (expiresAt.isNullOrEmpty()) return ""

    return remember(expiresAt) {
        try {
            val expiryInstant = Instant.parse(expiresAt)
            val nowInstant = Instant.now()

            val seconds = ChronoUnit.SECONDS.between(nowInstant, expiryInstant)
            val minutes = ChronoUnit.MINUTES.between(nowInstant, expiryInstant)
            val hours = ChronoUnit.HOURS.between(nowInstant, expiryInstant)
            val days = ChronoUnit.DAYS.between(nowInstant, expiryInstant)

            val formatter = RelativeDateTimeFormatter.getInstance(Locale.getDefault())
            val direction =
                if (expiryInstant.isAfter(nowInstant)) Direction.NEXT else Direction.LAST

            when {
                abs(days) >= 1 -> {
                    formatter.format(abs(days).toDouble(), direction, RelativeUnit.DAYS)
                }

                abs(hours) >= 1 -> {
                    formatter.format(abs(hours).toDouble(), direction, RelativeUnit.HOURS)
                }

                abs(minutes) >= 1 -> {
                    formatter.format(abs(minutes).toDouble(), direction, RelativeUnit.MINUTES)
                }

                else -> {
                    if (abs(seconds) <= 5) {
                        formatter.format(Direction.THIS, RelativeDateTimeFormatter.AbsoluteUnit.NOW)
                    } else {
                        formatter.format(abs(seconds).toDouble(), direction, RelativeUnit.SECONDS)
                    }
                }
            }
        } catch (_: Exception) {
            ""
        }
    }
}

@Composable
fun rememberRelativeCreationDate(createdAt: String?): String {
    if (createdAt.isNullOrEmpty()) return ""

    return remember(createdAt) {
        try {
            val expiryInstant = Instant.parse(createdAt)
            val nowInstant = Instant.now()

            val seconds = ChronoUnit.SECONDS.between(nowInstant, expiryInstant)
            val minutes = ChronoUnit.MINUTES.between(nowInstant, expiryInstant)
            val hours = ChronoUnit.HOURS.between(nowInstant, expiryInstant)
            val days = ChronoUnit.DAYS.between(nowInstant, expiryInstant)

            val formatter = RelativeDateTimeFormatter.getInstance(Locale.getDefault())
            val direction =
                if (expiryInstant.isAfter(nowInstant)) Direction.NEXT else Direction.LAST

            when {
                abs(days) >= 1 -> {
                    formatter.format(abs(days).toDouble(), direction, RelativeUnit.DAYS)
                }

                abs(hours) >= 1 -> {
                    formatter.format(abs(hours).toDouble(), direction, RelativeUnit.HOURS)
                }

                abs(minutes) >= 1 -> {
                    formatter.format(abs(minutes).toDouble(), direction, RelativeUnit.MINUTES)
                }

                else -> {
                    if (abs(seconds) <= 5) {
                        formatter.format(Direction.THIS, RelativeDateTimeFormatter.AbsoluteUnit.NOW)
                    } else {
                        formatter.format(abs(seconds).toDouble(), direction, RelativeUnit.SECONDS)
                    }
                }
            }
        } catch (_: Exception) {
            ""
        }
    }
}

private const val PreviewDevice = "spec:width=360dp,height=800dp,dpi=440"

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun PreviewAppShell(
    screen: Screen,
    content: @Composable () -> Unit,
) {
    val colors =
        androidx.compose.material3.darkColorScheme(
            primary = Color(0xFFFC0FC0),
            secondary = Color(0xFF9A7CFF),
            background = DarkBackground,
            surface = DarkSurface,
            error = Color(0xFFFF6B8A),
        )
    MaterialTheme(colorScheme = colors) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Scaffold(
                containerColor = MaterialTheme.colorScheme.background,
                topBar = {
                    TopAppBar(
                        title = {
                            Column {
                                Text("AITSYS Go", fontWeight = FontWeight.Bold)
                                Text(
                                    "Android",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        },
                        colors = TopAppBarDefaults.topAppBarColors(containerColor = DarkBackground),
                    )
                },
                bottomBar = {
                    NavigationBar(containerColor = DarkSurface) {
                        NavigationBarItem(
                            screen == Screen.CREATE,
                            {},
                            { Icon(Icons.Default.Add, null) },
                            label = { Text("Create") },
                        )
                        NavigationBarItem(
                            screen == Screen.MANAGE,
                            {},
                            { Icon(Icons.Default.Link, null) },
                            label = { Text("Manage") },
                        )
                        NavigationBarItem(
                            screen == Screen.SETTINGS,
                            {},
                            { Icon(Icons.Default.Settings, null) },
                            label = { Text("Settings") },
                        )
                    }
                },
            ) { padding ->
                Box(Modifier.fillMaxSize().padding(padding)) { content() }
            }
        }
    }
}

@Preview(name = "Create", showBackground = true, showSystemUi = true, device = PreviewDevice)
@Composable
private fun CreateScreenPreview() {
    var draft by remember {
        mutableStateOf(
            LinkDraft(
                destinationUrl = "https://www.example.com/very-useful-page",
                slug = "example-page",
                title = "Example page",
            ),
        )
    }
    PreviewAppShell(Screen.CREATE) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                "Create a short link",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            LinkForm(draft, { draft = it })
            Button(
                onClick = {},
                modifier = Modifier.fillMaxWidth().height(52.dp),
            ) { Text("Create short link") }
            ResultCard("https://go.aitsys.dev/example-page", LocalContext.current)
        }
    }
}

@Preview(name = "Manage", showBackground = true, showSystemUi = true, device = PreviewDevice)
@Composable
private fun ManageScreenPreview() {
    val link =
        LinkRecord(
            slug = "link-shortener",
            destinationUrl = "https://github.com/Aiko-IT-Systems/cloudflare-link-shortener",
            title = "AITSYS Go SourceCode",
            creator = "Lulalaby",
            password = "meow",
            createdAt = "2026-08-25T20:54:29.553Z",
            expiresAt = "2027-08-25T20:54:29.553Z",
            embedTitle = "Aiko-IT-Systems/cloudflare-link-shortener",
            embedDescription = "AITSYS Go is a privacy-first, multi-user link shortener built on Cloudflare Workers",
            embedImageUrl = "https://miku-cdn.aitsys.dev/assets/miku/shut.jpg",
            embedSiteName = "GitHub",
        )
    PreviewAppShell(Screen.MANAGE) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Your active links",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            LinkCardContent(link, "https://go.aitsys.dev/link-shortener", {}, {}, {}, {}, {}, {})
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                OutlinedButton(onClick = {}, enabled = false) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, null)
                    Text("Previous")
                }
                OutlinedButton(onClick = {}) {
                    Text("Next")
                    Icon(Icons.AutoMirrored.Filled.ArrowForward, null)
                }
            }
        }
    }
}

@Preview(name = "Settings", showBackground = true, showSystemUi = true, device = PreviewDevice)
@Composable
private fun SettingsScreenPreview() {
    var apiBase by remember { mutableStateOf("https://go.aitsys.dev") }
    var token by remember { mutableStateOf("aig_example-token") }
    var automatic by remember { mutableStateOf(false) }
    var appLock by remember { mutableStateOf(true) }
    PreviewAppShell(Screen.SETTINGS) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                "Settings",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            OutlinedTextField(
                apiBase,
                {
                    apiBase = it
                },
                label = {
                    Text("Shortener API base URL")
                },
                supportingText = { Text("Exact HTTPS origin") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                token,
                {
                    token = it
                },
                label = {
                    Text("Issued user token")
                },
                visualTransformation = PasswordVisualTransformation(),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Text("Share behavior", fontWeight = FontWeight.Bold)
            ShareChoice(
                "Configure before creating",
                ShareMode.CONFIGURE,
                if (automatic) ShareMode.AUTOMATIC else ShareMode.CONFIGURE,
            ) {
                automatic =
                    it == ShareMode.AUTOMATIC
            }
            ShareChoice(
                "Create automatically, then show the result",
                ShareMode.AUTOMATIC,
                if (automatic) ShareMode.AUTOMATIC else ShareMode.CONFIGURE,
            ) {
                automatic =
                    it == ShareMode.AUTOMATIC
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = {}) { Text("Save") }
                OutlinedButton(onClick = {}) { Text("Test connection") }
            }
            HorizontalDivider()
            Text("Privacy", fontWeight = FontWeight.Bold)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Lock app with biometrics")
                    Text(
                        "Require biometrics or device screen lock before showing link data.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(checked = appLock, onCheckedChange = { appLock = it })
            }
            HorizontalDivider()
            Text("Branding", fontWeight = FontWeight.Bold)
            Text("AITSYS Go · Aiko IT Systems", color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedButton(onClick = {}) { Text("Add branded home shortcut") }
            HorizontalDivider()
            Text("About", fontWeight = FontWeight.Bold)
            Row {
                Column {
                    Text("Version:", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("Host:", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("API Version:", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("Privacy Contact:", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("Privacy Policy:", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Spacer(Modifier.width(8.dp))
                val uriHandler = LocalUriHandler.current
                val version = "v1.0.0"
                val host = "https://go.aitsys.dev"
                val privacyMail = "privacy@aitsys.dev"
                val apiVersion = 1
                Column {
                    Text(
                        version,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.Blue,
                        textDecoration = TextDecoration.Underline,
                        modifier = Modifier.clickable {
                            uriHandler.openUri("https://github.com/Aiko-IT-Systems/cloudflare-link-shortener/releases/tag/$version")
                        },
                    )
                    Text(
                        host,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.Blue,
                        textDecoration = TextDecoration.Underline,
                        modifier = Modifier.clickable {
                            uriHandler.openUri(host)
                        },
                    )
                    Text(
                        "$apiVersion",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.clickable {
                            uriHandler.openUri(host)
                        },
                    )
                    Text(
                        privacyMail,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.Blue,
                        textDecoration = TextDecoration.Underline,
                        modifier = Modifier.clickable {
                            uriHandler.openUri("mailto:$privacyMail")
                        },
                    )
                    Text(
                        "$host/privacy",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.Blue,
                        textDecoration = TextDecoration.Underline,
                        modifier = Modifier.clickable {
                            uriHandler.openUri("$host/privacy")
                        },
                    )
                }
            }
            HorizontalDivider()
            Text("Debug Information", fontWeight = FontWeight.Bold)
        }
    }
}

@Preview(name = "App lock", showBackground = true, showSystemUi = true, device = PreviewDevice)
@Composable
private fun AppLockScreenPreview() {
    MaterialTheme(
        colorScheme =
            androidx.compose.material3.darkColorScheme(
                primary = Color(0xFFFC0FC0),
                background = DarkBackground,
                surface = DarkSurface,
            ),
    ) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            AppLockScreen(UiState(loaded = true, appLocked = true)) {}
        }
    }
}
