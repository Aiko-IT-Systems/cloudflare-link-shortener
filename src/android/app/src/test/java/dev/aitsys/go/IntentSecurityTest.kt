package dev.aitsys.go

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class IntentSecurityTest {
    @Test fun acceptsOnlyPlainTextShareIntents() {
        assertTrue(IntentSecurity.isPlainTextShare("android.intent.action.SEND", "text/plain"))
        assertFalse(IntentSecurity.isPlainTextShare("android.intent.action.VIEW", "text/plain"))
        assertFalse(IntentSecurity.isPlainTextShare("android.intent.action.SEND", "text/html"))
        assertFalse(IntentSecurity.isPlainTextShare(null, "text/plain"))
    }

    @Test fun acceptsBoundedOrdinarySharedText() {
        assertEquals(
            "Look at https://example.com/path",
            IntentSecurity.validatedSharedText("Look at https://example.com/path"),
        )
        assertEquals(
            "x".repeat(IntentSecurity.MAX_SHARED_TEXT_LENGTH),
            IntentSecurity.validatedSharedText("x".repeat(IntentSecurity.MAX_SHARED_TEXT_LENGTH)),
        )
    }

    @Test fun rejectsMalformedOrOversizedSharedText() {
        assertNull(IntentSecurity.validatedSharedText(null))
        assertNull(IntentSecurity.validatedSharedText("  \n"))
        assertNull(IntentSecurity.validatedSharedText("https://example.com/\u0000evil"))
        assertNull(IntentSecurity.validatedSharedText("x".repeat(IntentSecurity.MAX_SHARED_TEXT_LENGTH + 1)))
    }

    @Test fun normalizesOnlyExactHttpsUrls() {
        assertEquals("https://example.com/path", IntentSecurity.normalizedHttpsUrl("  https://example.com/path  "))
        assertNull(IntentSecurity.normalizedHttpsUrl("http://example.com"))
        assertNull(IntentSecurity.normalizedHttpsUrl("Open https://example.com"))
        assertNull(IntentSecurity.normalizedHttpsUrl("https://"))
    }
}
