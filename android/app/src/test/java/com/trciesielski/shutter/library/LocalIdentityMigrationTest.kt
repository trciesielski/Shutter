package com.trciesielski.shutter.library

import android.content.Context
import android.net.Uri
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.trciesielski.shutter.data.LibraryRepository
import com.trciesielski.shutter.data.PlaylistEntity
import com.trciesielski.shutter.data.PlaylistRepository
import com.trciesielski.shutter.data.ShutterDatabase
import com.trciesielski.shutter.data.Track
import com.trciesielski.shutter.data.TrackSource
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class LocalIdentityMigrationTest {
    @Test fun metadataChangeRetargetsEveryPlaylistOccurrenceWithoutChangingOrder() = runBlocking {
        val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ShutterDatabase::class.java).build()
        try {
            val library = LibraryRepository(db)
            val playlists = PlaylistRepository(db)
            val uri = Uri.parse("content://provider/document/song%3A1")
            fun track(size: Long, modified: Long) = Track(LocalTrackId.from(uri, size, modified), "Song", "Artist", "Album", uri,
                TrackSource.LOCAL, "audio/mpeg", 1000, null, null)
            val old = track(42, 123)
            val updated = track(43, 124)
            library.upsert(old, 42, 123)
            playlists.upsert(PlaylistEntity("first", "First"), listOf("other", old.id, old.id))
            playlists.upsert(PlaylistEntity("second", "Second"), listOf(old.id), setOf(old.id))

            assertEquals(listOf(old.id), library.replaceLocalIdentity(updated, 43, 124))

            assertNull(library.resolve(old.id))
            assertEquals(updated, library.resolve(updated.id))
            assertEquals(listOf("other", updated.id, updated.id), playlists.entries("first").map { it.trackId })
            assertEquals(listOf(updated.id), playlists.entries("second").map { it.trackId })
            assertTrue(playlists.entries("first").none { it.orphaned })
            assertTrue(playlists.entries("second").none { it.orphaned })
            assertTrue(library.replaceLocalIdentity(updated, 43, 124).isEmpty())
        } finally { db.close() }
    }
}
