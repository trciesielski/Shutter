package com.trciesielski.shutter.playback

import android.content.Context
import android.net.Uri
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.trciesielski.shutter.data.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class BrowseTreeTest {
    private fun catalog(id: String) = Track(id, "Online $id", "Artist", "Album", Uri.parse("https://example.com/$id.mp3"), TrackSource.CATALOG, "audio/mpeg", 9000, null, null)
    private fun local(uri: String): Track {
        val parsed = Uri.parse(uri)
        return Track(LibraryRepository.localId(parsed, null, null), "Local song", "Artist", "Album", parsed, TrackSource.LOCAL, "audio/flac", 8000, null, null)
    }

    @Test fun rootAndCategoriesExposeOnlyBrowsableNodes() = runBlocking {
        val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ShutterDatabase::class.java).build()
        try {
            val tree = BrowseTree(LibraryRepository(db), PlaylistRepository(db)) { Result.success(CatalogSnapshot(null, emptyList(), emptyList())) }
            assertEquals("root", tree.rootId)
            assertEquals(listOf("catalog", "local", "playlists"), tree.children(tree.rootId).map { it.mediaId })
            assertTrue(tree.children(tree.rootId).all { it.mediaMetadata.isBrowsable == true && it.mediaMetadata.isPlayable == false })
            assertTrue(tree.children("local").isEmpty())
            assertNull(tree.item("missing"))
        } finally { db.close() }
    }

    @Test fun catalogLocalAndPlaylistChildrenKeepPlayableMetadataAndOrder() = runBlocking {
        val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ShutterDatabase::class.java).build()
        try {
            val library = LibraryRepository(db)
            val playlists = PlaylistRepository(db)
            val local = local("content://documents/song")
            library.upsert(local)
            playlists.upsert(PlaylistEntity("road", "Road mix"), listOf("second", local.id, "orphan"), setOf("orphan"))
            val tree = BrowseTree(library, playlists) { Result.success(CatalogSnapshot(null, listOf(catalog("first"), catalog("second")), emptyList())) }
            assertEquals(listOf("first", "second"), tree.children("catalog").map { it.mediaId })
            assertEquals(listOf(local.id), tree.children("local").map { it.mediaId })
            assertEquals(listOf("playlist:road"), tree.children("playlists").map { it.mediaId })
            val playlistChildren = tree.children("playlist:road")
            assertEquals(2, playlistChildren.size)
            assertTrue(playlistChildren.all { it.mediaId.startsWith("playlist-entry:") })
            assertEquals(listOf("Online second", "Local song"), playlistChildren.map { it.mediaMetadata.title.toString() })
            val playlistQueue = tree.queueFor(playlistChildren[1].mediaId)!!
            assertEquals(listOf("second", local.id), playlistQueue.first.map { it.mediaId })
            assertEquals(1, playlistQueue.second)
            assertEquals(Uri.parse("content://documents/song"), tree.item(local.id)!!.localConfiguration!!.uri)
            assertEquals(9000L, tree.item("second")!!.mediaMetadata.durationMs)
            assertTrue(playlistChildren.all { it.mediaMetadata.isPlayable == true && it.mediaMetadata.isBrowsable == false })
        } finally { db.close() }
    }

    @Test fun failedCatalogShowsSafeNonPlayableErrorAndCanRetry() = runBlocking {
        val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ShutterDatabase::class.java).build()
        try {
            var fail = true
            val tree = BrowseTree(LibraryRepository(db), PlaylistRepository(db)) {
                if (fail) Result.failure(IllegalStateException("offline")) else Result.success(CatalogSnapshot(null, listOf(catalog("recovered")), emptyList()))
            }
            assertEquals(listOf("catalog:error"), tree.children("catalog").map { it.mediaId })
            assertFalse(tree.children("catalog").single().mediaMetadata.isPlayable == true)
            fail = false
            assertEquals(listOf("recovered"), tree.children("catalog").map { it.mediaId })
        } finally { db.close() }
    }
}
