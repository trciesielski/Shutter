package com.trciesielski.shutter.migration

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.trciesielski.shutter.data.*
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.flow.first
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class WebStorageMigrationTest {
    private fun database() = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ShutterDatabase::class.java).allowMainThreadQueries().build()

    @Test fun validStateMergesAndPreservesOrphanReferences() = runBlocking {
        val db = database()
        try {
            db.playlistDao().upsert(PlaylistEntity("mix", "Existing"))
            db.playlistDao().insertEntries(listOf(PlaylistEntryEntity("mix", 0, "native")))
            val report = WebStorageMigration(db).migrate(mapOf(
                "shutter-user-playlists-v1" to """[{"id":"mix","name":"Mix","tracks":["native","blob:old","blob:old","remote"]}]""",
                "shutter-track-preferences-v1" to """{"remote":"up","bad":"unknown"}""",
                "shutter-listening-history-v1" to """[{"id":"remote","at":123},{"id":"remote","at":123}]""",
                "shutter-last-position-v1" to """{"id":"remote","time":1.5}"""
            ), 1)
            assertTrue(report.completed)
            assertEquals(listOf("native", "blob:old", "remote"), db.playlistDao().entries("mix").map { it.trackId })
            assertTrue(db.playlistDao().entries("mix")[1].orphaned)
            assertEquals(5, db.stateDao().rating("remote")?.rating)
            assertEquals(1, db.stateDao().history().size)
            assertEquals(1500L, db.stateDao().playback()?.positionMs)
            assertNotNull(db.stateDao().migration(1))
        } finally { db.close() }
    }

    @Test fun malformedAndMissingKeysAreReportedWithoutBlockingValidKeys() = runBlocking {
        val db = database()
        try {
            val result = WebStorageMigration(db).migrate(mapOf("shutter-user-playlists-v1" to "[oops", "shutter-track-preferences-v1" to """{"a":"down"}"""), 1)
            assertTrue(result.completed)
            assertTrue(result.diagnostics.any { it.contains("shutter-user-playlists-v1") })
            assertEquals(0, db.stateDao().rating("a")?.rating)
        } finally { db.close() }
    }

    @Test fun unknownVersionAndFailedTransactionRemainRetryable() = runBlocking {
        val db = database()
        try {
            assertThrows(IllegalArgumentException::class.java) { runBlocking { WebStorageMigration(db).migrate(emptyMap(), 2) } }
            assertNull(db.stateDao().migration(1))
            db.close()
            try { WebStorageMigration(db).migrate(emptyMap(), 1); fail("closed database accepted migration") } catch (_: android.database.SQLException) { }
        } finally { if (db.isOpen) db.close() }
    }

    @Test fun repeatedMigrationDoesNotOverwriteNativeEdits() = runBlocking {
        val db = database()
        try {
            val migration = WebStorageMigration(db)
            migration.migrate(mapOf("shutter-user-playlists-v1" to """[{"id":"p","name":"Old","tracks":["a"]}]"""), 1)
            PlaylistRepository(db).upsert(PlaylistEntity("p", "Native"), listOf("a", "native"))
            assertFalse(migration.migrate(mapOf("shutter-user-playlists-v1" to """[{"id":"p","name":"New","tracks":["b"]}]"""), 1).completed)
            assertEquals("Native", db.playlistDao().observePlaylists().first().single().name)
            assertEquals(listOf("a", "native"), db.playlistDao().entries("p").map { it.trackId })
        } finally { db.close() }
    }
}
