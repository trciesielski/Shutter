package com.trciesielski.shutter.playback

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import com.trciesielski.shutter.data.ShutterDatabase
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.lang.reflect.Proxy

@RunWith(RobolectricTestRunner::class)
class QueueStateTest {
    private class FakePlayer {
        val queue = mutableListOf(MediaItem.Builder().setMediaId("a").build(), MediaItem.Builder().setMediaId("b").build())
        var index = 0
        var position = 1200L
        var duration = 9000L
        var shuffle = false
        var repeat = Player.REPEAT_MODE_OFF
        val player: Player = Proxy.newProxyInstance(Player::class.java.classLoader, arrayOf(Player::class.java)) { _, method, args ->
            when (method.name) {
                "getMediaItemCount" -> queue.size
                "getMediaItemAt" -> queue[args!![0] as Int]
                "getCurrentMediaItem" -> queue[index]
                "getCurrentMediaItemIndex" -> index
                "getCurrentPosition" -> position
                "getDuration" -> duration
                "getBufferedPosition" -> position + 1000
                "getShuffleModeEnabled" -> shuffle
                "getRepeatMode" -> repeat
                "getPlaybackState" -> Player.STATE_READY
                "getPlayWhenReady" -> true
                "getPlayerError" -> null
                else -> error("Unexpected Player method: ${method.name}")
            }
        } as Player
    }

    @Test fun snapshotTracksQueueTransitionsAndMonotonicRevisions() {
        val fake = FakePlayer()
        val store = PlaybackStateStore(fake.player)
        val first = store.snapshot()
        assertEquals(listOf("a", "b"), first.queue)
        assertEquals("a", first.mediaId)
        assertEquals("playing", first.state)
        assertEquals(1200L, first.positionMs)
        assertEquals(9000L, first.durationMs)
        fake.index = 1
        fake.shuffle = true
        fake.repeat = Player.REPEAT_MODE_ALL
        store.changed()
        val next = store.snapshot()
        assertEquals("b", next.mediaId)
        assertEquals(listOf("a", "b"), next.queue)
        assertTrue(next.shuffle)
        assertEquals(Player.REPEAT_MODE_ALL, next.repeat)
        assertTrue(next.revision > first.revision)
        assertEquals(next.revision, store.snapshot().revision)
    }

    @Test fun seekClampsToDurationAndNeverGoesNegative() {
        assertEquals(0L, PlaybackStateStore.clampSeek(-5, 9000))
        assertEquals(9000L, PlaybackStateStore.clampSeek(12000, 9000))
        assertEquals(12000L, PlaybackStateStore.clampSeek(12000, -1))
    }

    @Test fun latePersistenceCannotReplaceNewerQueuePosition() = runBlocking {
        val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ShutterDatabase::class.java).build()
        try {
            val fake = FakePlayer()
            val store = PlaybackStateStore(fake.player)
            val old = store.snapshot()
            fake.index = 1
            fake.position = 3500
            store.changed()
            val newer = store.snapshot()
            store.savePosition(db, newer)
            store.savePosition(db, old)
            assertEquals("b", db.stateDao().playback()!!.trackId)
            assertEquals(3500L, db.stateDao().playback()!!.positionMs)
        } finally { db.close() }
    }
}
