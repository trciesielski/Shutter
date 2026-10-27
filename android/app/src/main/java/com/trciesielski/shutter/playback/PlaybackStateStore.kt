package com.trciesielski.shutter.playback

import android.content.Context
import androidx.media3.common.Player
import com.trciesielski.shutter.data.ShutterDatabase
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray

data class PlaybackSnapshot(
    val revision: Long,
    val mediaId: String?,
    val state: String,
    val positionMs: Long,
    val durationMs: Long,
    val bufferedPositionMs: Long,
    val shuffle: Boolean,
    val repeat: Int,
    val queue: List<String>
)

data class RestoredPlayback(val queue: List<androidx.media3.common.MediaItem>, val index: Int, val positionMs: Long, val shuffle: Boolean, val repeat: Int)

/** The Media3 player is authoritative; this store only snapshots and persists its state. */
class PlaybackStateStore(private val player: Player) {
    private var revision = 0L
    private var last: PlaybackSnapshot? = null
    private val persistenceMutex = Mutex()
    private var persistedRevision = -1L

    fun changed() { revision++ }

    fun snapshot(): PlaybackSnapshot {
        val duration = player.duration.takeIf { it >= 0 } ?: -1L
        val current = PlaybackSnapshot(
            revision = revision,
            mediaId = player.currentMediaItem?.mediaId,
            state = when {
                player.playerError != null -> "error"
                player.playbackState == Player.STATE_BUFFERING -> "buffering"
                player.playbackState == Player.STATE_ENDED -> "ended"
                player.playbackState == Player.STATE_READY && player.playWhenReady -> "playing"
                player.playbackState == Player.STATE_READY -> "paused"
                else -> "idle"
            },
            positionMs = player.currentPosition.coerceAtLeast(0),
            durationMs = duration,
            bufferedPositionMs = player.bufferedPosition.coerceAtLeast(0),
            shuffle = player.shuffleModeEnabled,
            repeat = player.repeatMode,
            queue = (0 until player.mediaItemCount).map { player.getMediaItemAt(it).mediaId }
        )
        if (last != null && current.copy(revision = last!!.revision) != last) revision++
        return current.copy(revision = revision).also { last = it }
    }

    fun saveQueue(context: Context, snapshot: PlaybackSnapshot) {
        context.getSharedPreferences("shutter_playback", Context.MODE_PRIVATE).edit()
            .putString("queue", JSONArray(snapshot.queue).toString())
            .putBoolean("shuffle", snapshot.shuffle)
            .putInt("repeat", snapshot.repeat)
            .apply()
    }

    suspend fun savePosition(db: ShutterDatabase, snapshot: PlaybackSnapshot) {
        persistenceMutex.withLock {
            if (snapshot.revision <= persistedRevision) return@withLock
            db.stateDao().upsertPlayback(com.trciesielski.shutter.data.PlaybackStateEntity(
                trackId = snapshot.mediaId,
                positionMs = snapshot.positionMs,
                updatedAtMs = System.currentTimeMillis()
            ))
            persistedRevision = snapshot.revision
        }
    }

    suspend fun restore(context: Context, db: ShutterDatabase, tree: BrowseTree): RestoredPlayback? {
        val prefs = context.getSharedPreferences("shutter_playback", Context.MODE_PRIVATE)
        val saved = db.stateDao().playback() ?: return null
        val ids = try {
            val values = JSONArray(prefs.getString("queue", "[]"))
            (0 until values.length()).mapNotNull { values.optString(it).takeIf(String::isNotBlank) }
        } catch (_: Exception) { emptyList() }
        val queue = ids.mapNotNull { tree.item(it)?.takeIf { item -> item.mediaMetadata.isPlayable == true } }
            .ifEmpty { listOfNotNull(saved.trackId?.let { tree.item(it) }?.takeIf { it.mediaMetadata.isPlayable == true }) }
        if (queue.isEmpty()) return null
        val index = queue.indexOfFirst { it.mediaId == saved.trackId }.coerceAtLeast(0)
        return RestoredPlayback(queue, index, clampSeek(saved.positionMs, queue[index].mediaMetadata.durationMs ?: -1),
            prefs.getBoolean("shuffle", false), prefs.getInt("repeat", Player.REPEAT_MODE_OFF).takeIf { it in 0..2 } ?: Player.REPEAT_MODE_OFF)
    }

    companion object {
        fun clampSeek(positionMs: Long, durationMs: Long): Long = positionMs.coerceAtLeast(0).let { if (durationMs >= 0) it.coerceAtMost(durationMs) else it }
    }
}
