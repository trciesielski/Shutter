package com.trciesielski.shutter.plugin

import android.os.Bundle
import org.json.JSONArray
import org.json.JSONObject
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.session.SessionResult
import com.google.common.util.concurrent.SettableFuture
import com.trciesielski.shutter.playback.MediaQueueCommands
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
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

    @Test fun optimisticControllerQueueDoesNotCompleteBeforeLateServiceRejection() = runBlocking {
        val serviceReply = CompletableDeferred<SessionResult>()
        var controllerQueue = listOf("old")
        var snapshotRead = false
        val command = async {
            runCatching {
                MediaQueueCommands.awaitAccepted({ serviceReply.await() }) {
                    snapshotRead = true
                    controllerQueue
                }
            }
        }
        controllerQueue = listOf("optimistic")
        yield()
        assertFalse(command.isCompleted)
        serviceReply.complete(SessionResult(SessionResult.RESULT_ERROR_BAD_VALUE))
        assertTrue(command.await().isFailure)
        assertFalse(snapshotRead)
    }

    @Test fun acceptedServiceResultSuppliesExpandedQueueIdentity() = runBlocking {
        val extras = Bundle().apply {
            putStringArrayList("queueIds", arrayListOf("first", "second"))
            putInt("queueIndex", 1)
        }
        val outcome = MediaQueueCommands.awaitAccepted({ SessionResult(SessionResult.RESULT_SUCCESS, extras) }) { it }
        assertEquals(listOf("first", "second"), outcome.ids)
        assertEquals(1, outcome.index)
    }
}
