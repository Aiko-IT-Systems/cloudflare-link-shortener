package dev.aitsys.go

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.aitsys.go.data.AppSettings
import dev.aitsys.go.data.SettingsRepository
import dev.aitsys.go.data.ShareMode
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SettingsRepositoryTest {
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    private val repository = SettingsRepository(context)

    @After fun cleanToken() = repository.clearToken()

    @Test fun tokenRoundTripsThroughKeystoreBackedStorage() = runBlocking {
        repository.save(AppSettings("https://example.com", ShareMode.AUTOMATIC, appLockEnabled = true), "aig_test.secret")
        val (settings, token) = repository.load()
        assertEquals("https://example.com", settings.apiBase)
        assertEquals(ShareMode.AUTOMATIC, settings.shareMode)
        assertEquals(true, settings.appLockEnabled)
        assertEquals("aig_test.secret", token)
    }
}
