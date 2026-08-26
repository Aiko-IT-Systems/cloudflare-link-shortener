package dev.aitsys.go.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ApiClientTest {
    @Test fun normalizesHttpsOrigin() {
        assertEquals("https://go.aitsys.dev", ApiClient.normalizeOrigin(" https://go.aitsys.dev/ "))
        assertEquals("https://example.com:8443", ApiClient.normalizeOrigin("https://example.com:8443"))
    }

    @Test fun rejectsInsecureOrPathBasedBaseUrls() {
        assertThrows(IllegalArgumentException::class.java) { ApiClient.normalizeOrigin("http://go.aitsys.dev") }
        assertThrows(IllegalArgumentException::class.java) { ApiClient.normalizeOrigin("https://go.aitsys.dev/api") }
        assertThrows(IllegalArgumentException::class.java) { ApiClient.normalizeOrigin("https://user@example.com") }
    }
}
