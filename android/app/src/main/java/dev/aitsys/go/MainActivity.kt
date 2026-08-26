package dev.aitsys.go

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModelProvider
import androidx.fragment.app.FragmentActivity

class MainActivity : FragmentActivity() {
    private lateinit var model: MainViewModel
    private var authenticationInProgress = false
    private var onAuthenticationSuccess: (() -> Unit)? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        model = ViewModelProvider(this)[MainViewModel::class.java]
        setContent {
            AitsysGoApp(
                model = model,
                requestUnlock = { authenticate { model.unlock() } },
                requestEnableAppLock = { authenticate { model.enableAppLock() } },
            )
        }
        handleIntent(intent)
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

    private fun handleIntent(intent: Intent?) {
        if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            model.receiveSharedText(intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString())
        }
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
