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

    @Test fun updatePayloadLeavesPasswordUnchangedAndNeverChangesSlug() {
        val json = LinkDraft(destinationUrl = "https://example.com", slug = "ignored").toJson(forUpdate = true)
        assertFalse(json.has("slug"))
        assertTrue(json.isNull("title"))
        assertFalse(json.has("password"))
        assertTrue(json.isNull("expiresAt"))
        assertTrue(json.isNull("embedTitle"))
        assertTrue(json.isNull("embedDescription"))
        assertTrue(json.isNull("embedImageUrl"))
        assertTrue(json.isNull("embedSiteName"))
    }

    @Test fun updatePayloadCanReplaceOrClearPasswordExplicitly() {
        val replacement =
            LinkDraft(
                destinationUrl = "https://example.com",
                password = "new secret",
                passwordUpdate = PasswordUpdate.REPLACE,
            ).toJson(forUpdate = true)
        assertEquals("new secret", replacement.getString("password"))

        val cleared =
            LinkDraft(
                destinationUrl = "https://example.com",
                passwordUpdate = PasswordUpdate.CLEAR,
            ).toJson(forUpdate = true)
        assertTrue(cleared.isNull("password"))
    }
}
