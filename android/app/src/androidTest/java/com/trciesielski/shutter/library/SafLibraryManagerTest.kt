package com.trciesielski.shutter.library

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.trciesielski.shutter.data.LibraryRepository
import com.trciesielski.shutter.data.ShutterDatabase
import com.trciesielski.shutter.data.PlaylistEntity
import com.trciesielski.shutter.data.PlaylistRepository
import com.trciesielski.shutter.data.Track
import com.trciesielski.shutter.data.TrackSource
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class SafLibraryManagerTest {
    private lateinit var context: Context
    private lateinit var db: ShutterDatabase
    private lateinit var library: LibraryRepository
    private val uri = Uri.parse("content://test.documents/document/song%3A1")
    private val grants = mutableSetOf<Uri>()
    private var released = 0
    private var metadata = AudioMetadata("Original", "Artist", "Album", "audio/mpeg", 1000, 42, 123, null)
    private var revoked = false
    private lateinit var sourceDocument: File
    private lateinit var reader: MetadataReader

    @Before fun setup() {
        context = InstrumentationRegistry.getInstrumentation().targetContext
        db = Room.inMemoryDatabaseBuilder(context, ShutterDatabase::class.java).build()
        library = LibraryRepository(db)
        sourceDocument = File(context.cacheDir, "saf-test-source.mp3").apply { writeText("provider audio") }
        reader = object : MetadataReader(context) {
            override fun read(uri: Uri, idForArtwork: (Long?, Long?) -> String): AudioMetadata {
                if (revoked) throw SecurityException("revoked")
                return metadata
            }
        }
    }

    @After fun cleanup() { db.close(); sourceDocument.delete() }

    private fun manager() = SafLibraryManager(context, library, reader,
        isDocument = { true },
        persistRead = { if (revoked) throw SecurityException("revoked") else grants.add(it) },
        releaseRead = { grants.remove(it); released++ })

    @Test fun pickerRequestsPersistableMultipleAudioDocuments() {
        val intent = SafLibraryManager.pickerIntent()
        assertEquals(Intent.ACTION_OPEN_DOCUMENT, intent.action)
        assertTrue(intent.hasCategory(Intent.CATEGORY_OPENABLE))
        assertTrue(intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false))
        assertEquals("*/*", intent.type)
        assertTrue(intent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        assertTrue(intent.flags and Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION != 0)
        val types = intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES)!!.toSet()
        assertTrue(types.containsAll(setOf("audio/mpeg", "audio/flac", "audio/wav", "audio/mp4")))
    }

    @Test fun duplicateSelectionAndRenamedMetadataUpsertOneTrack() = runBlocking {
        val manager = manager()
        assertEquals(1, manager.importUris(listOf(uri, uri)).imported)
        metadata = metadata.copy(title = "Renamed")
        assertEquals(1, manager.importUris(listOf(uri)).imported)
        assertEquals(1, library.tracks().size)
        assertEquals("Renamed", library.tracks().single().title)
        assertTrue(uri in grants)
        assertEquals(LocalTrackId.from(uri, 42, 123), library.tracks().single().id)
    }

    @Test fun revokedUriIsReportedWithoutAddingTrack() = runBlocking {
        revoked = true
        val report = manager().importUris(listOf(uri))
        assertEquals(0, report.imported)
        assertTrue(report.failed.containsKey(uri))
        assertTrue(library.tracks().isEmpty())
    }

    @Test fun changedDocumentMetadataReplacesOldIdentity() = runBlocking {
        val manager = manager()
        manager.importUris(listOf(uri))
        val oldId = library.tracks().single().id
        val playlists = PlaylistRepository(db)
        playlists.upsert(PlaylistEntity("p", "Favorites"), listOf(oldId, "other", oldId))
        metadata = metadata.copy(size = 43, modifiedMs = 124)
        assertEquals(1, manager.importUris(listOf(uri)).imported)
        assertNull(library.resolve(oldId))
        assertEquals(LocalTrackId.from(uri, 43, 124), library.tracks().single().id)
        assertEquals(listOf(library.tracks().single().id, "other", library.tracks().single().id), playlists.entries("p").map { it.trackId })
        assertEquals(0, released)
    }

    @Test fun unsupportedTypeIsReportedWithoutAddingTrack() = runBlocking {
        for (mime in listOf("audio/aac", "audio/ogg", "audio/opus")) {
            metadata = metadata.copy(mimeType = mime)
            val report = manager().importUris(listOf(uri))
            assertEquals(0, report.imported)
            assertTrue(report.failed.containsKey(uri))
            assertTrue(library.tracks().isEmpty())
            assertFalse(uri in grants)
        }
        assertEquals(3, released)
    }

    @Test fun removalReleasesGrantAndKeepsProviderDocument() = runBlocking {
        val manager = manager()
        manager.importUris(listOf(uri))
        val id = library.tracks().single().id
        val art = reader.artworkFile(id).apply { parentFile!!.mkdirs(); writeText("cached cover") }
        manager.removeTrack(id)
        assertNull(library.resolve(id))
        assertFalse(art.exists())
        assertEquals(1, released)
        assertFalse(uri in grants)
        assertTrue(sourceDocument.exists())
    }

    @Test fun removalRetainsGrantWhileAnotherLocalIdentityUsesUri() = runBlocking {
        val manager = manager()
        manager.importUris(listOf(uri))
        val first = library.tracks().single()
        val secondId = LocalTrackId.from(uri, 43, 124)
        library.upsert(Track(secondId, "Updated", "Artist", "Album", uri,
            TrackSource.LOCAL, "audio/mpeg", null, null, null), 43, 124)
        manager.removeTrack(first.id)
        assertEquals(0, released)
        assertTrue(uri in grants)
    }
}
