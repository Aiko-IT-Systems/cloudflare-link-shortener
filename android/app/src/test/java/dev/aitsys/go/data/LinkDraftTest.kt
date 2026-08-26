package dev.aitsys.go.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LinkDraftTest {
    @Test fun createPayloadOmitsBlankOptionalFields() {
        val json = LinkDraft(destinationUrl = "https://example.com", suppressSocialPreview = true).toJson()
        assertEquals("https://example.com", json.getString("destinationUrl"))
        assertTrue(json.getBoolean("suppressSocialPreview"))
        assertFalse(json.has("creator"))
        assertFalse(json.has("password"))
        assertFalse(json.has("slug"))
    }

    @Test fun updatePayloadClearsBlankOptionalFieldsAndNeverChangesSlug() {
        val json = LinkDraft(destinationUrl = "https://example.com", slug = "ignored").toJson(forUpdate = true)
        assertFalse(json.has("slug"))
        assertTrue(json.isNull("title"))
        assertTrue(json.isNull("password"))
        assertTrue(json.isNull("expiresAt"))
        assertTrue(json.isNull("embedTitle"))
        assertTrue(json.isNull("embedDescription"))
        assertTrue(json.isNull("embedImageUrl"))
        assertTrue(json.isNull("embedSiteName"))
    }
}
