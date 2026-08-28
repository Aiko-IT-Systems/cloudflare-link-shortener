package dev.aitsys.go

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModelProvider
import androidx.fragment.app.FragmentActivity

class MainActivity : FragmentActivity() {
    private lateinit var model: MainViewModel
    private lateinit var inAppUpdates: InAppUpdateController
    private var authenticationInProgress = false
    private var onAuthenticationSuccess: (() -> Unit)? = null
    private var flexibleUpdateReady by mutableStateOf(false)
    private val updateLauncher =
        registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) {}

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        model = ViewModelProvider(this)[MainViewModel::class.java]
        inAppUpdates =
            InAppUpdateController(
                context = this,
                updateLauncher = updateLauncher,
                onFlexibleUpdateReady = { flexibleUpdateReady = true },
            ).also(InAppUpdateController::register)
        setContent {
            AitsysGoApp(
                model = model,
                requestUnlock = { authenticate { model.unlock() } },
                requestEnableAppLock = { authenticate { model.enableAppLock() } },
                flexibleUpdateReady = flexibleUpdateReady,
                installFlexibleUpdate = {
                    flexibleUpdateReady = false
                    inAppUpdates.completeFlexibleUpdate()
                },
                dismissFlexibleUpdate = { flexibleUpdateReady = false },
            )
        }
        if (savedInstanceState == null) handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onStop() {
        super.onStop()
        if (!isChangingConfigurations && !authenticationInProgress) model.lock()
    }

    override fun onResume() {
        super.onResume()
        if (::inAppUpdates.isInitialized) inAppUpdates.checkForUpdate()
    }

    override fun onDestroy() {
        if (::inAppUpdates.isInitialized) inAppUpdates.unregister()
        super.onDestroy()
    }

    private fun handleIntent(incomingIntent: Intent?) {
        if (incomingIntent == null || !IntentSecurity.isPlainTextShare(incomingIntent.action, incomingIntent.type)) return

        val sharedText =
            runCatching {
                IntentSecurity.validatedSharedText(
                    incomingIntent.getCharSequenceExtra(Intent.EXTRA_TEXT),
                )
            }.getOrNull()

        setIntent(
            Intent(this, MainActivity::class.java).apply {
                action = Intent.ACTION_MAIN
                addCategory(Intent.CATEGORY_LAUNCHER)
            },
        )
        model.receiveSharedText(sharedText)
    }

    private fun authenticate(onSuccess: () -> Unit) {
        if (authenticationInProgress) return
        val authenticators = BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        val availability = BiometricManager.from(this).canAuthenticate(authenticators)
        if (availability != BiometricManager.BIOMETRIC_SUCCESS) {
            model.showAppLockError("Set up a device PIN, pattern, password, or biometric before enabling app lock.")
            return
        }

        authenticationInProgress = true
        onAuthenticationSuccess = onSuccess
        val prompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                authenticationInProgress = false
                onAuthenticationSuccess?.also { callback -> onAuthenticationSuccess = null; callback() }
            }

            override fun onAuthenticationError(errorCode: Int, error: CharSequence) {
                authenticationInProgress = false
                onAuthenticationSuccess = null
                model.showAppLockError("Authentication was cancelled or unavailable. ${error.toString().take(120)}")
            }
        })
        prompt.authenticate(
            BiometricPrompt.PromptInfo.Builder()
                .setTitle("Unlock AITSYS Go")
                .setSubtitle("Use biometrics or your device screen lock")
                .setAllowedAuthenticators(authenticators)
                .build(),
        )
    }
}
