package com.trciesielski.shutter.library

import android.net.Uri
import com.trciesielski.shutter.data.LibraryRepository
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class LocalTrackIdTest {
    @Test fun delegatesToCanonicalRepositoryIdentity() {
        val uri = Uri.parse("content://provider/document/song%3A1")
        assertEquals(LibraryRepository.localId(uri, 32, 100), LocalTrackId.from(uri, 32, 100))
        assertEquals(LocalTrackId.from(uri, 32, 100), LocalTrackId.from(uri, 32, 100))
        assertNotEquals(LocalTrackId.from(uri, 32, 100), LocalTrackId.from(uri, 33, 100))
        assertNotEquals(LocalTrackId.from(uri, 32, 100), LocalTrackId.from(uri, 32, 101))
        assertNotEquals(LocalTrackId.from(uri, null, null), LocalTrackId.from(Uri.parse("content://provider/document/song%3A2"), null, null))
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsNonProviderUri() { LocalTrackId.from(Uri.parse("file:///song.mp3"), null, null) }
}
