package com.trciesielski.shutter.data

import android.net.Uri
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import android.content.Context
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class RepositoryIdentityTest {
    @Test fun persistedDocumentIdentityIsStableAndMetadataSensitive() {
        val uri = Uri.parse("content://com.example.documents/document/audio%3A42")
        val id = LibraryRepository.localId(uri, 2048, 12345)
        assertEquals(id, LibraryRepository.localId(uri, 2048, 12345))
        assertTrue(id.startsWith("local:"))
        assertNotEquals(id, LibraryRepository.localId(uri, 2049, 12345))
        assertNotEquals(id, LibraryRepository.localId(uri, 2048, 12346))
        assertNotEquals(id, LibraryRepository.localId(Uri.parse("content://com.example.documents/document/audio%3A43"), 2048, 12345))
    }

    @Test fun upsertAndRemovalAreIdempotentAndDoNotRemovePlaylistReference() = runBlocking {
        val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ShutterDatabase::class.java).allowMainThreadQueries().build()
        try {
            val library = LibraryRepository(db)
            val playlists = PlaylistRepository(db)
            val uri = Uri.parse("content://documents/song")
            val track = Track(LibraryRepository.localId(uri, 2048, 12345), "Song", "Artist", "Album", uri, TrackSource.LOCAL, "audio/mpeg", 1000, null, null)
            library.upsert(track, 2048, 12345)
            library.upsert(track, 2048, 12345)
            assertEquals(listOf(track.id), library.tracks().map { it.id })
            playlists.upsert(PlaylistEntity("p", "Playlist"), listOf(track.id, "legacy-blob"), setOf("legacy-blob"))
            assertEquals(listOf(false, true), playlists.entries("p").map { it.orphaned })
            library.remove(track.id)
            library.remove(track.id)
            assertNull(library.resolve(track.id))
            assertEquals(listOf(track.id, "legacy-blob"), playlists.entries("p").map { it.trackId })
        } finally { db.close() }
    }

    @Test fun localUpsertRejectsCallerIdentityThatDoesNotMatchDocumentMetadata() = runBlocking {
        val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ShutterDatabase::class.java).allowMainThreadQueries().build()
        try {
            val library = LibraryRepository(db)
            val uri = Uri.parse("content://documents/song")
            val canonical = LibraryRepository.localId(uri, 2048, 12345)
            val track = Track(canonical, "Song", "Artist", "Album", uri, TrackSource.LOCAL, "audio/mpeg", null, null, null)
            library.upsert(track, 2048, 12345)
            try {
                library.upsert(track.copy(id = "local:arbitrary"), 2048, 12345)
                fail("noncanonical local ID was accepted")
            } catch (_: IllegalArgumentException) { }
            assertEquals(listOf(canonical), library.tracks().map { it.id })
        } finally { db.close() }
    }

    @Test fun playlistUpdatePreservesOrphanFlagsWhenCallerOmitsThem() = runBlocking {
        val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ShutterDatabase::class.java).allowMainThreadQueries().build()
        try {
            val playlists = PlaylistRepository(db)
            playlists.upsert(PlaylistEntity("p", "First"), listOf("legacy-blob", "online"), setOf("legacy-blob"))
            playlists.upsert(PlaylistEntity("p", "Renamed"), listOf("online", "legacy-blob", "legacy-blob"))
            assertEquals(listOf(false, true, true), playlists.entries("p").map { it.orphaned })
            playlists.upsert(PlaylistEntity("p", "Explicit"), listOf("legacy-blob"), emptySet())
            assertEquals(listOf(false), playlists.entries("p").map { it.orphaned })
        } finally { db.close() }
    }

    @Test fun playlistReplacementPreservesOrderAndScalarStatePersists() = runBlocking {
        val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ShutterDatabase::class.java).allowMainThreadQueries().build()
        try {
            val playlists = PlaylistRepository(db)
            val library = LibraryRepository(db)
            playlists.upsert(PlaylistEntity("p", "First"), listOf("b", "a"))
            playlists.upsert(PlaylistEntity("p", "Renamed"), listOf("a", "b", "a"))
            assertEquals(listOf("a", "b", "a"), playlists.entries("p").map { it.trackId })
            library.setRating("a", 5, true)
            library.recordPlay("a", 100)
            library.recordPlay("a", 100)
            library.savePosition("a", 450, 101)
            library.markMigration(1, 102)
            library.markMigration(1, 103)
            assertEquals(5, db.stateDao().rating("a")?.rating)
            assertEquals(1, db.stateDao().history().size)
            assertEquals(450L, db.stateDao().playback()?.positionMs)
            assertEquals(102L, db.stateDao().migration(1)?.completedAtMs)
        } finally { db.close() }
    }
}
