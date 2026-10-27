package com.trciesielski.shutter.library

import android.content.Context
import androidx.core.content.FileProvider
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ArtworkUriTest {
    @Test fun appPrivateArtworkUsesRestrictedFileProviderContentUri() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val reader = MetadataReader(context)
        val file = reader.artworkFile("artwork-contract").apply {
            parentFile?.mkdirs()
            writeText("test artwork")
        }
        try {
            val uri = reader.artworkUri(file)
            assertEquals("content", uri.scheme)
            assertEquals("${context.packageName}.fileprovider", uri.authority)
            assertTrue(uri.path.orEmpty().contains("library_artwork"))

            val provider = context.packageManager.resolveContentProvider(uri.authority!!, 0)
            assertNotNull(provider)
            assertFalse(provider!!.exported)
            assertTrue(provider.grantUriPermissions)
            assertEquals(uri, FileProvider.getUriForFile(context, uri.authority!!, file))
        } finally {
            file.delete()
        }
    }
}
