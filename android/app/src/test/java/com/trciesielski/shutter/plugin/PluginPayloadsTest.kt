package com.trciesielski.shutter.plugin

import org.json.JSONArray
import org.json.JSONObject
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import com.google.common.util.concurrent.SettableFuture
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PluginPayloadsTest {
    @Test fun rejectsInvalidCommands() {
        assertThrows(IllegalArgumentException::class.java) { PluginPayloads.seek(JSONObject().put("positionMs", -1)) }
        assertThrows(IllegalArgumentException::class.java) { PluginPayloads.volume(JSONObject().put("value", 2)) }
        assertThrows(IllegalArgumentException::class.java) { PluginPayloads.queue(JSONObject().put("trackIds", JSONArray().put("")), 0) }
        assertThrows(IllegalArgumentException::class.java) { PluginPayloads.repeat(JSONObject().put("mode", "random")) }
    }
    @Test fun rejectsStaleEventsAndKeepsMonotonicRevisions() {
        val gate = PluginEventBridge()
        assertTrue(gate.accept(4))
        assertFalse(gate.accept(3))
        assertFalse(gate.accept(4))
        assertTrue(gate.nextRevision() > 4)
    }

    @Test fun unknownQueueIdLeavesOldQueueUntouchedAndResolverFailuresPropagate() = runBlocking {
        var queue = listOf("old")
        val ids = listOf("valid", "missing")
        val resolver: suspend (String) -> MediaItem? = { id -> if (id == "valid") MediaItem.Builder().setMediaId(id)
            .setMediaMetadata(MediaMetadata.Builder().setIsPlayable(true).build()).build() else null }
        val failure = assertThrows(IllegalArgumentException::class.java) { runBlocking {
            PluginPayloads.replaceQueue(ids, resolver) { queue = it.map { item -> item.mediaId } }
        } }
        assertTrue(failure.message!!.contains("missing"))
        assertEquals(listOf("old"), queue)
        assertThrows(IllegalStateException::class.java) { runBlocking {
            PluginPayloads.replaceQueue(listOf("valid"), { throw IllegalStateException("session failed") }) { queue = it.map { item -> item.mediaId } }
        } }
        assertEquals(listOf("old"), queue)
    }

    @Test fun successfulQueueReplacementUsesResolvedPlayableItems() = runBlocking {
        var queue = listOf("old")
        val requested = listOf("one", "two")
        PluginPayloads.replaceQueue(requested, { id -> MediaItem.Builder().setMediaId(id)
            .setMediaMetadata(MediaMetadata.Builder().setIsPlayable(true).build()).build() }) { items ->
            queue = items.map { it.mediaId }
        }
        assertEquals(requested, queue)
    }

    @Test fun failedOrCancelledConnectionCanStartAgain() = runBlocking {
        val slot = ControllerConnection<String>()
        val failed = SettableFuture.create<String>()
        failed.setException(IllegalStateException("disconnected"))
        assertThrows(java.util.concurrent.ExecutionException::class.java) { runBlocking {
            slot.await({ failed }) { it.get() }
        } }
        val retry = SettableFuture.create<String>()
        assertSame(retry, slot.getOrStart { retry })
        slot.cancel()
        assertTrue(retry.isCancelled)
        assertNotSame(retry, slot.getOrStart { SettableFuture.create() })
    }
}
