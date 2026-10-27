package com.trciesielski.shutter.library

import android.content.Intent
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SupportedAudioFormatsTest {
    @Test fun pickerOffersOnlyRequiredFormats() {
        val intent = SafLibraryManager.pickerIntent()
        assertEquals(Intent.ACTION_OPEN_DOCUMENT, intent.action)
        assertEquals("*/*", intent.type)
        val advertised = intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES)!!.toSet()
        assertEquals(MetadataReader.SUPPORTED_MIME, advertised)
        assertFalse(advertised.any { it in setOf("audio/aac", "audio/ogg", "audio/opus") })
    }

    @Test fun optionalExtensionsDoNotPassImportAllowlist() {
        for (extension in listOf("aac", "ogg", "opus")) {
            assertFalse(MetadataReader.mimeFromName("song.$extension") in MetadataReader.SUPPORTED_MIME)
        }
        for (extension in listOf("mp3", "flac", "wav", "m4a")) {
            assertTrue(MetadataReader.mimeFromName("song.$extension") in MetadataReader.SUPPORTED_MIME)
        }
    }
}
