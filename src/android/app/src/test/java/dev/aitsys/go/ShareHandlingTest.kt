package dev.aitsys.go

import dev.aitsys.go.data.LinkDraft
import dev.aitsys.go.data.ShareMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ShareHandlingTest {
    private val draft = LinkDraft(destinationUrl = "https://example.com")

    @Test fun configureModeOnlyPopulatesTheForm() {
        assertNull(pendingSharedDraft(ShareMode.CONFIGURE, draft))
    }

    @Test fun automaticModeRequiresConfirmation() {
        assertEquals(draft, pendingSharedDraft(ShareMode.AUTOMATIC, draft))
    }
}
