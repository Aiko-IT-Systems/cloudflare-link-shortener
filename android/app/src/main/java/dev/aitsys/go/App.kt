package dev.aitsys.go

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color as AndroidColor
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Edit
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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.aitsys.go.data.Branding
import dev.aitsys.go.data.LinkDraft
import dev.aitsys.go.data.LinkRecord
import dev.aitsys.go.data.ShareMode

private val DarkBackground = Color(0xFF12051A)
private val DarkSurface = Color(0xFF21102B)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AitsysGoApp(model: MainViewModel) {
    val state = model.state
    val context = LocalContext.current
    val brand = parseBrandColor(state.branding.brandColor)
    val colors = androidx.compose.material3.darkColorScheme(
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

    MaterialTheme(colorScheme = colors) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Scaffold(
                containerColor = MaterialTheme.colorScheme.background,
                snackbarHost = { SnackbarHost(snackbar) },
                topBar = {
                    TopAppBar(
                        title = { BrandHeader(state.branding) },
                        colors = TopAppBarDefaults.topAppBarColors(containerColor = DarkBackground),
                    )
                },
                bottomBar = {
                    NavigationBar(containerColor = DarkSurface) {
                        NavigationBarItem(state.screen == Screen.CREATE, { model.navigate(Screen.CREATE) }, { Icon(Icons.Default.Add, null) }, label = { Text("Create") })
                        NavigationBarItem(state.screen == Screen.MANAGE, { model.navigate(Screen.MANAGE) }, { Icon(Icons.Default.Link, null) }, label = { Text("Manage") })
                        NavigationBarItem(state.screen == Screen.SETTINGS, { model.navigate(Screen.SETTINGS) }, { Icon(Icons.Default.Settings, null) }, label = { Text("Settings") })
                    }
                },
            ) { padding ->
                Box(Modifier.fillMaxSize().padding(padding)) {
                    when {
                        !state.loaded -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                        state.screen == Screen.CREATE -> CreateScreen(state, model, context)
                        state.screen == Screen.MANAGE -> ManageScreen(state, model, context)
                        state.screen == Screen.SETTINGS -> SettingsScreen(state, model)
                    }
                    if (state.busy) Surface(color = Color.Black.copy(alpha = .38f), modifier = Modifier.fillMaxSize()) {
                        Box(Modifier.fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
                    }
                }
            }
        }
    }

    state.editing?.let { EditDialog(it, model) }
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

@Composable
private fun BrandHeader(branding: Branding) {
    val context = LocalContext.current
    val bitmap = remember(branding.brandLogoUrl) { BrandingAssets.cached(context) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (bitmap != null) {
            Image(bitmap.asImageBitmap(), branding.brandLogoAlt, Modifier.size(32.dp))
            Spacer(Modifier.width(10.dp))
        }
        Column {
            Text(branding.siteName, fontWeight = FontWeight.Bold)
            Text("Android", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun CreateScreen(state: UiState, model: MainViewModel, context: Context) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Create a short link", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
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
private fun LinkForm(draft: LinkDraft, update: (LinkDraft) -> Unit, showSlug: Boolean = true) {
    var advanced by remember { mutableStateOf(false) }
    OutlinedTextField(draft.destinationUrl, { update(draft.copy(destinationUrl = it)) }, label = { Text("Destination URL") }, supportingText = { Text("HTTPS only") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    if (showSlug) OutlinedTextField(draft.slug, { update(draft.copy(slug = it)) }, label = { Text("Custom slug (optional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(draft.title, { update(draft.copy(title = it)) }, label = { Text("Fallback title (optional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(draft.password, { update(draft.copy(password = it)) }, label = { Text("Password (optional)") }, visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(draft.expiresAt, { update(draft.copy(expiresAt = it)) }, label = { Text("Expiry (optional)") }, supportingText = { Text("ISO 8601, for example 2026-12-31T23:59:00Z") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(draft.suppressSocialPreview, { update(draft.copy(suppressSocialPreview = it)) })
        Text("Suppress social preview")
    }
    TextButton(onClick = { advanced = !advanced }) { Text(if (advanced) "Hide manual metadata" else "Manual metadata") }
    if (advanced) {
        OutlinedTextField(draft.embedTitle, { update(draft.copy(embedTitle = it)) }, label = { Text("Embed title") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(draft.embedDescription, { update(draft.copy(embedDescription = it)) }, label = { Text("Embed description") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(draft.embedImageUrl, { update(draft.copy(embedImageUrl = it)) }, label = { Text("Embed image URL") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(draft.embedSiteName, { update(draft.copy(embedSiteName = it)) }, label = { Text("Embed site name") }, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun ResultCard(url: String, context: Context) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Created", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
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
private fun ManageScreen(state: UiState, model: MainViewModel, context: Context) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Your active links", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        if (state.token.isBlank()) SetupCard { model.navigate(Screen.SETTINGS) }
        if (state.links.isEmpty() && !state.busy) Text("No active links on this page.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        state.links.forEach { LinkCard(it, state.settings.apiBase, model, context) }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            OutlinedButton(model::previousPage, enabled = state.previousCursors.isNotEmpty() && !state.busy) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null); Text("Previous") }
            OutlinedButton(model::nextPage, enabled = state.nextCursor != null && !state.busy) { Text("Next"); Icon(Icons.AutoMirrored.Filled.ArrowForward, null) }
        }
    }
}

@Composable
private fun LinkCard(record: LinkRecord, apiBase: String, model: MainViewModel, context: Context) {
    val shortUrl = "${apiBase.trimEnd('/')}/${Uri.encode(record.slug)}"
    Card {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(shortUrl, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            Text(record.title ?: record.embedTitle ?: record.destinationUrl, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(record.destinationUrl, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            HorizontalDivider()
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                IconButton({ open(context, shortUrl) }) { Icon(Icons.Default.OpenInBrowser, "Open") }
                IconButton({ copy(context, shortUrl) }) { Icon(Icons.Default.ContentCopy, "Copy") }
                IconButton({ share(context, shortUrl) }) { Icon(Icons.Default.Share, "Share") }
                IconButton({ model.edit(record) }) { Icon(Icons.Default.Edit, "Edit") }
                IconButton({ model.refresh(record) }) { Icon(Icons.Default.Refresh, "Refresh metadata") }
                IconButton({ model.confirmDisable(record) }) { Icon(Icons.Default.DeleteOutline, "Disable") }
            }
        }
    }
}

@Composable
private fun SettingsScreen(state: UiState, model: MainViewModel) {
    var apiBase by remember(state.settings.apiBase) { mutableStateOf(state.settings.apiBase) }
    var token by remember(state.token) { mutableStateOf(state.token) }
    var shareMode by remember(state.settings.shareMode) { mutableStateOf(state.settings.shareMode) }
    val uriHandler = LocalUriHandler.current
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Settings", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        OutlinedTextField(apiBase, { apiBase = it }, label = { Text("Shortener API base URL") }, supportingText = { Text("Exact HTTPS origin") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(token, { token = it }, label = { Text("Issued user token") }, visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth())
        Text("Share behavior", fontWeight = FontWeight.Bold)
        ShareChoice("Configure before creating", ShareMode.CONFIGURE, shareMode) { shareMode = it }
        ShareChoice("Create automatically, then show the result", ShareMode.AUTOMATIC, shareMode) { shareMode = it }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button({ model.saveSettings(apiBase, token, shareMode) }) { Text("Save") }
            OutlinedButton({ model.testConnection(apiBase, token) }) { Text("Test connection") }
        }
        HorizontalDivider()
        Text("Branding", fontWeight = FontWeight.Bold)
        Text("${state.branding.siteName} · ${state.branding.brandLogoAlt}", color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton({ model.addBrandedShortcut() }) { Text("Add branded home shortcut") }
        Text("Android keeps the installed app and share-target icon static. This optional shortcut uses the shortener’s cached branding icon.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        HorizontalDivider()
        Text("The issued token is encrypted with Android Keystore and excluded from device backup. Never use the master administrator token.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        state.branding.privacyEmail?.let { email ->
            TextButton({ uriHandler.openUri("mailto:${Uri.encode(email)}") }) { Text("Privacy: $email") }
        }
        TextButton({ uriHandler.openUri("${apiBase.trimEnd('/')}/privacy") }) { Text("Privacy policy") }
    }
}

@Composable
private fun ShareChoice(label: String, value: ShareMode, selected: ShareMode, choose: (ShareMode) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        RadioButton(selected == value, { choose(value) })
        Text(label)
    }
}

@Composable
private fun EditDialog(record: LinkRecord, model: MainViewModel) {
    var draft by remember(record.slug) {
        mutableStateOf(LinkDraft(
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
        ))
    }
    AlertDialog(
        onDismissRequest = { model.edit(null) },
        title = { Text("Edit ${record.slug}") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()).height(430.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                LinkForm(draft, { draft = it }, showSlug = false)
            }
        },
        confirmButton = { Button({ model.update(record, draft) }) { Text("Save") } },
        dismissButton = { TextButton({ model.edit(null) }) { Text("Cancel") } },
    )
}

private fun parseBrandColor(value: String): Color = runCatching { Color(AndroidColor.parseColor(value)) }.getOrDefault(Color(0xFFFC0FC0))

private fun copy(context: Context, text: String) {
    context.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Short URL", text))
}

private fun open(context: Context, url: String) {
    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
}

private fun share(context: Context, url: String) {
    context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, url) }, "Share short link"))
}
