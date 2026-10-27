package com.trciesielski.shutter.playback

import android.os.Bundle
import androidx.media3.common.MediaItem
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult

/** Acknowledged queue operations handled by the service that owns the player. */
object MediaQueueCommands {
    val SET_QUEUE = SessionCommand("shutter.queue.set.v1", Bundle.EMPTY)
    val PLAY_ITEM = SessionCommand("shutter.queue.playItem.v1", Bundle.EMPTY)
    const val IDS = "trackIds"
    const val INDEX = "startIndex"
    const val TRACK_ID = "trackId"
    private const val RESULT_IDS = "queueIds"
    private const val RESULT_INDEX = "queueIndex"

    data class Prepared(val items: List<MediaItem>, val startIndex: Int) {
        val outcome: Outcome get() = Outcome(items.map { it.mediaId }, startIndex)
    }
    data class Outcome(val ids: List<String>, val index: Int)

    suspend fun prepareSetQueue(tree: BrowseTree, ids: List<String>, index: Int): Prepared {
        require(ids.size in 1..5000 && index in ids.indices) { "Invalid queue" }
        val items = ids.map { id ->
            tree.item(id)?.takeIf { it.mediaMetadata.isPlayable == true && it.localConfiguration != null }
                ?: throw IllegalArgumentException("Unknown or unplayable media ID: $id")
        }
        return Prepared(items, index)
    }

    suspend fun preparePlayItem(tree: BrowseTree, id: String): Prepared {
        require(id.isNotBlank() && id.length <= 256) { "Invalid trackId" }
        val item = tree.item(id)
        require(item?.mediaMetadata?.isPlayable == true) { "Unknown or unplayable media ID: $id" }
        val (items, index) = tree.queueFor(id) ?: throw IllegalArgumentException("Unknown media ID: $id")
        require(items.isNotEmpty() && index in items.indices && items.all { it.mediaMetadata.isPlayable == true && it.localConfiguration != null }) {
            "Playlist entry is no longer playable: $id"
        }
        return Prepared(items, index)
    }

    fun accepted(prepared: Prepared): SessionResult = SessionResult(SessionResult.RESULT_SUCCESS, Bundle().apply {
        putStringArrayList(RESULT_IDS, ArrayList(prepared.outcome.ids))
        putInt(RESULT_INDEX, prepared.startIndex)
    })

    suspend fun <T> awaitAccepted(send: suspend () -> SessionResult, reconcile: suspend (Outcome) -> T): T {
        val result = send()
        if (result.resultCode != SessionResult.RESULT_SUCCESS) {
            throw IllegalStateException(result.sessionError?.message ?: "Media session rejected queue command: ${result.resultCode}")
        }
        val ids = result.extras.getStringArrayList(RESULT_IDS)?.toList()
            ?: throw IllegalStateException("Media session returned no queue")
        val index = result.extras.getInt(RESULT_INDEX, -1)
        check(ids.isNotEmpty() && index in ids.indices) { "Media session returned invalid queue" }
        return reconcile(Outcome(ids, index))
    }
}
