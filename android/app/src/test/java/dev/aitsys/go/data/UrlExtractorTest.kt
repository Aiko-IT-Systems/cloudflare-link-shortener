package dev.aitsys.go.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UrlExtractorTest {
    @Test fun extractsFirstHttpsUrlAndTrimsPunctuation() {
        assertEquals("https://example.com/a?b=1", UrlExtractor.firstHttpsUrl("Look: https://example.com/a?b=1, then https://other.test"))
    }

    @Test fun rejectsNonHttpsAndInvalidHosts() {
        assertNull(UrlExtractor.firstHttpsUrl("http://example.com"))
        assertNull(UrlExtractor.firstHttpsUrl("https://"))
        assertFalse(UrlExtractor.isHttpsUrl("hello https://example.com"))
    }

    @Test fun acceptsExactHttpsUrl() {
        assertTrue(UrlExtractor.isHttpsUrl("https://example.com/path#fragment"))
    }
}
