package dev.aitsys.go

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class HtmlEntityDecodingTest {
    @Test
    fun decodesNumericAndNamedEntitiesForEmbedDisplay() {
        assertEquals(
            "@kylxee__edits – アニメ ♥",
            decodeHtmlEntities("&#064;kylxee__edits &ndash; &#x30a2;&#x30cb;&#x30e1; &hearts;"),
        )
    }
}
