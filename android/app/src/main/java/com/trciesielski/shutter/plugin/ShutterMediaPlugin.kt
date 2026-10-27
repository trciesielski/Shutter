package com.trciesielski.shutter.plugin

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.session.MediaBrowser
import androidx.media3.session.MediaController
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.LibraryResult
import androidx.media3.session.SessionError
import androidx.media3.session.SessionResult
import androidx.media3.session.SessionToken
import androidx.room.Room
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.common.util.concurrent.ListenableFuture
import com.trciesielski.shutter.data.*
import com.trciesielski.shutter.library.SafLibraryManager
import com.trciesielski.shutter.playback.ShutterMediaLibraryService
import com.trciesielski.shutter.playback.MediaQueueCommands
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.selects.select
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ExecutionException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

@CapacitorPlugin(name = "ShutterMedia")
class ShutterMediaPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val ordering = PluginEventBridge()
    private var browser: MediaBrowser? = null
    private val connection = ControllerConnection<MediaBrowser>()
    private var pendingMutation: CompletableDeferred<Unit>? = null
    private var database: ShutterDatabase? = null
    private val db: ShutterDatabase get() = database ?: Room.databaseBuilder(context.applicationContext, ShutterDatabase::class.java, "shutter-library.db").build().also { database = it }
    private val listener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) { publishState(player) }
        override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
            emit("error", JSObject().put("message", error.message ?: "Playback error"))
        }
        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
            emit("audioFocusChanged", JSObject().put("playWhenReady", playWhenReady).put("reason", reason))
        }
    }
    private val sessionListener = object : MediaBrowser.Listener {
        override fun onError(controller: MediaController, error: SessionError) {
            val failure = IllegalStateException("Media session rejected command: ${error.code} ${error.message}")
            pendingMutation?.completeExceptionally(failure)
            emit("error", JSObject().put("message", failure.message))
        }
        override fun onDisconnected(controller: MediaController) {
            pendingMutation?.completeExceptionally(IllegalStateException("Media session disconnected"))
            if (browser === controller) browser = null
            connection.cancel()
        }
    }

    override fun load() {
        scope.launch {
            while (isActive) {
                delay(1000)
                browser?.takeIf { it.isPlaying }?.let { emit("position", position(it)) }
            }
        }
    }

    override fun handleOnDestroy() {
        scope.cancel()
        browser?.removeListener(listener)
        browser?.release()
        browser = null
        connection.cancel()
        database?.close()
        database = null
        super.handleOnDestroy()
    }

    private suspend fun <T> await(future: ListenableFuture<T>): T = suspendCancellableCoroutine { continuation ->
        future.addListener({
            try { continuation.resume(future.get()) }
            catch (error: ExecutionException) { continuation.resumeWithException(error.cause ?: error) }
            catch (error: Exception) { continuation.resumeWithException(error) }
        }, context.mainExecutor)
    }

    private suspend fun controller(): MediaBrowser {
        browser?.let { return it }
        return connection.await({ MediaBrowser.Builder(context,
            SessionToken(context, ComponentName(context, ShutterMediaLibraryService::class.java)))
            .setListener(sessionListener).buildAsync() }) { future ->
            await(future).also { it.addListener(listener); browser = it }
        }
    }

    private fun execute(call: PluginCall, block: suspend () -> JSObject) {
        scope.launch {
            try { call.resolve(block()) }
            catch (error: Exception) {
                emit("error", JSObject().put("message", error.message ?: "Native media command failed"))
                call.reject(error.message ?: "Native media command failed", error)
            }
        }
    }

    private fun emit(name: String, data: JSObject) {
        data.put("schemaVersion", PluginPayloads.VERSION).put("revision", ordering.nextRevision())
            .put("timestampMs", System.currentTimeMillis()).put("eventType", name)
        notifyListeners(name, data)
    }

    private fun state(player: Player): JSObject = JSObject()
        .put("schemaVersion", PluginPayloads.VERSION)
        .put("eventType", "playbackState")
        .put("revision", ordering.nextRevision())
        .put("timestampMs", System.currentTimeMillis())
        .put("mediaId", player.currentMediaItem?.mediaId)
        .put("state", when {
            player.playerError != null -> "error"
            player.playbackState == Player.STATE_BUFFERING -> "buffering"
            player.playbackState == Player.STATE_ENDED -> "ended"
            player.playbackState == Player.STATE_READY && player.isPlaying -> "playing"
            player.playbackState == Player.STATE_READY -> "paused"
            else -> "idle"
        })
        .put("positionMs", player.currentPosition.coerceAtLeast(0))
        .put("durationMs", player.duration.takeIf { it >= 0 } ?: -1)
        .put("bufferedPositionMs", player.bufferedPosition.coerceAtLeast(0))
        .put("volume", player.volume.toDouble())
        .put("shuffle", player.shuffleModeEnabled)
        .put("repeat", listOf("off", "one", "all").getOrElse(player.repeatMode) { "off" })
        .put("queue", JSONArray((0 until player.mediaItemCount).map { player.getMediaItemAt(it).mediaId }))
        .put("queueIndex", player.currentMediaItemIndex)

    private fun position(player: Player) = JSObject().put("mediaId", player.currentMediaItem?.mediaId)
        .put("positionMs", player.currentPosition.coerceAtLeast(0))
        .put("durationMs", player.duration.takeIf { it >= 0 } ?: -1)
        .put("bufferedPositionMs", player.bufferedPosition.coerceAtLeast(0))

    private fun publishState(player: Player) {
        val snapshot = state(player)
        notifyListeners("playbackState", snapshot)
        emit("position", position(player))
        emit("queueChanged", JSObject().put("queue", snapshot.optJSONArray("queue")).put("queueIndex", player.currentMediaItemIndex))
        val metadata = player.currentMediaItem?.mediaMetadata
        emit("metadataChanged", JSObject().put("mediaId", player.currentMediaItem?.mediaId)
            .put("title", metadata?.title?.toString()).put("artist", metadata?.artist?.toString()))
    }

    @PluginMethod fun connect(call: PluginCall) = execute(call) {
        val player = controller()
        emit("analysisFrame", JSObject().put("bands", JSONArray()).put("signalStatus", "unavailable"))
        state(player)
    }
    @PluginMethod fun disconnect(call: PluginCall) = execute(call) {
        pendingMutation?.completeExceptionally(IllegalStateException("Disconnected"))
        connection.cancel()
        browser?.removeListener(listener)
        browser?.release()
        browser = null
        JSObject().put("schemaVersion", 1)
    }
    @PluginMethod fun play(call: PluginCall) = command(call) { play() }
    @PluginMethod fun pause(call: PluginCall) = command(call) { pause() }
    @PluginMethod fun toggle(call: PluginCall) = command(call) { if (isPlaying) pause() else play() }
    @PluginMethod fun stop(call: PluginCall) = command(call) { stop() }
    @PluginMethod fun skipNext(call: PluginCall) = command(call) { seekToNextMediaItem() }
    @PluginMethod fun skipPrevious(call: PluginCall) = command(call) { seekToPreviousMediaItem() }
    @PluginMethod fun seekTo(call: PluginCall) = command(call) { seekTo(PluginPayloads.seek(call.data)) }
    @PluginMethod fun setVolume(call: PluginCall) = command(call) { volume = PluginPayloads.volume(call.data) }
    @PluginMethod fun setShuffle(call: PluginCall) = command(call) { shuffleModeEnabled = PluginPayloads.enabled(call.data) }
    @PluginMethod fun setRepeat(call: PluginCall) = command(call) { repeatMode = PluginPayloads.repeat(call.data) }
    private fun command(call: PluginCall, action: MediaBrowser.() -> Unit) = execute(call) { controller().let { it.action(); state(it) } }

    private suspend fun lookup(player: MediaBrowser, id: String): MediaItem? {
        val result = await(player.getItem(id))
        return when (result.resultCode) {
            LibraryResult.RESULT_SUCCESS -> result.value
            SessionError.ERROR_BAD_VALUE -> null
            else -> throw IllegalStateException("Media lookup failed: ${result.resultCode}")
        }
    }

    private fun queueIds(player: MediaBrowser): List<String> = (0 until player.mediaItemCount).map { player.getMediaItemAt(it).mediaId }

    private suspend fun awaitMutation(player: MediaBrowser, send: suspend () -> SessionResult) {
        check(pendingMutation == null) { "Another media command is pending" }
        val pending = CompletableDeferred<Unit>()
        pendingMutation = pending
        val changes = Channel<Unit>(Channel.CONFLATED)
        val observer = object : Player.Listener {
            override fun onEvents(player: Player, events: Player.Events) {
                changes.trySend(Unit)
            }
        }
        player.addListener(observer)
        try {
            withTimeout(10_000) {
                MediaQueueCommands.awaitAccepted(send) { outcome ->
                    if (pending.isCompleted) pending.await()
                    while (queueIds(player) != outcome.ids || player.currentMediaItemIndex != outcome.index) {
                        select<Unit> {
                            changes.onReceive { }
                            pending.onAwait { }
                        }
                    }
                    if (pending.isCompleted) pending.await()
                }
            }
        } finally {
            player.removeListener(observer)
            changes.close()
            if (pendingMutation === pending) pendingMutation = null
        }
    }

    @PluginMethod fun setQueue(call: PluginCall) = execute(call) {
        val (ids, index) = PluginPayloads.queue(call.data)
        val player = controller()
        PluginPayloads.replaceQueue(ids, { id -> lookup(player, id) }) { _ ->
            awaitMutation(player) {
                val args = Bundle().apply {
                    putStringArrayList(MediaQueueCommands.IDS, ArrayList(ids))
                    putInt(MediaQueueCommands.INDEX, index)
                }
                await(player.sendCustomCommand(MediaQueueCommands.SET_QUEUE, args))
            }
        }
        state(player)
    }
    @PluginMethod fun playItem(call: PluginCall) = execute(call) {
        val id = PluginPayloads.requiredId(call.data, "trackId")
        val player = controller()
        PluginPayloads.resolvePlayable(listOf(id)) { lookup(player, it) }
        awaitMutation(player) {
            await(player.sendCustomCommand(MediaQueueCommands.PLAY_ITEM, Bundle().apply {
                putString(MediaQueueCommands.TRACK_ID, id)
            }))
        }
        state(player)
    }

    private fun track(item: MediaItem): JSObject = JSObject().put("id", item.mediaId)
        .put("source", if (item.localConfiguration?.uri?.scheme == "content") "local" else "catalog")
        .put("title", item.mediaMetadata.title?.toString()).put("artist", item.mediaMetadata.artist?.toString())
        .put("album", item.mediaMetadata.albumTitle?.toString()).put("durationMs", item.mediaMetadata.durationMs)
        .put("artworkUri", item.mediaMetadata.artworkUri?.toString()).put("uri", item.localConfiguration?.uri?.toString())
    private fun track(item: Track): JSObject = JSObject().put("id", item.id).put("source", item.source.name.lowercase())
        .put("title", item.title).put("artist", item.artist).put("album", item.album)
        .put("durationMs", item.durationMs).put("artworkUri", item.artworkUri?.toString()).put("uri", item.uri.toString())

    @PluginMethod fun getCatalog(call: PluginCall) = execute(call) {
        val result = await(controller().getChildren("catalog", 0, 5000, null))
        require(result.resultCode == 0) { "Catalog unavailable" }
        val tracks = JSArray(result.value.orEmpty().filter { it.mediaMetadata.isPlayable == true }.map(::track))
        emit("catalogChanged", JSObject().put("tracks", tracks))
        JSObject().put("schemaVersion", 1).put("tracks", tracks)
    }
    @PluginMethod fun getLibrary(call: PluginCall) = execute(call) {
        val tracks = withContext(Dispatchers.IO) { LibraryRepository(db).tracks().filter { it.source == TrackSource.LOCAL } }
        JSObject().put("schemaVersion", 1).put("tracks", JSArray(tracks.map(::track)))
    }
    @PluginMethod fun getRatings(call: PluginCall) = execute(call) {
        val ratings = withContext(Dispatchers.IO) { LibraryRepository(db).preferenceRatings() }
        JSObject().put("schemaVersion", 1).put("ratings", JSObject().apply { ratings.forEach { (id, value) -> put(id, value) } })
    }
    @PluginMethod fun setRating(call: PluginCall) = execute(call) {
        val id = PluginPayloads.requiredId(call.data, "trackId")
        require(call.data.has("rating")) { "rating required" }
        val rawRating = call.data.opt("rating")
        require(rawRating == JSONObject.NULL || rawRating is String) { "Invalid rating" }
        val rating = rawRating as? String
        require(rating == null || rating == "up" || rating == "down") { "Invalid rating" }
        withContext(Dispatchers.IO) { LibraryRepository(db).setPreferenceRating(id, rating) }
        emit("libraryChanged", JSObject().put("ratedId", id))
        JSObject().put("schemaVersion", 1).put("trackId", id).put("rating", rating ?: JSONObject.NULL)
    }
    @PluginMethod fun getPlaylists(call: PluginCall) = execute(call) {
        val playlists = withContext(Dispatchers.IO) {
            val database = db
            database.playlistDao().observePlaylists().first().map { row ->
                JSObject().put("id", row.id).put("name", row.name)
                    .put("tracks", JSArray(database.playlistDao().entries(row.id).map { it.trackId }))
                    .put("orphanedIds", JSArray(database.playlistDao().entries(row.id).filter { it.orphaned }.map { it.trackId }))
            }
        }
        JSObject().put("schemaVersion", 1).put("playlists", JSArray(playlists))
    }
    @PluginMethod fun createPlaylist(call: PluginCall) = savePlaylist(call, true)
    @PluginMethod fun updatePlaylist(call: PluginCall) = savePlaylist(call, false)
    private fun savePlaylist(call: PluginCall, create: Boolean) = execute(call) {
        val id = PluginPayloads.requiredId(call.data, "id")
        val name = PluginPayloads.requiredId(call.data, "name")
        val ids = call.getArray("trackIds")?.let { array -> (0 until array.length()).map { i ->
            (array.opt(i) as? String)?.takeIf { it.isNotBlank() && it.length <= 256 } ?: throw IllegalArgumentException("Invalid track ID")
        } } ?: emptyList()
        withContext(Dispatchers.IO) {
            val rows = db.playlistDao().observePlaylists().first()
            require(rows.any { it.id == id } != create) { if (create) "Playlist exists" else "Playlist missing" }
            PlaylistRepository(db).upsert(PlaylistEntity(id, name, rows.firstOrNull { it.id == id }?.sortOrder ?: rows.size), ids.distinct())
        }
        emit("playlistChanged", JSObject().put("id", id))
        JSObject().put("schemaVersion", 1).put("id", id)
    }
    @PluginMethod fun deletePlaylist(call: PluginCall) = execute(call) {
        val id = PluginPayloads.requiredId(call.data, "id")
        withContext(Dispatchers.IO) { PlaylistRepository(db).remove(id) }
        emit("playlistChanged", JSObject().put("id", id))
        JSObject().put("schemaVersion", 1)
    }

    @PluginMethod fun pickLocalFiles(call: PluginCall) {
        startActivityForResult(call, SafLibraryManager.pickerIntent(), "filesPicked")
    }
    @ActivityCallback private fun filesPicked(call: PluginCall, result: androidx.activity.result.ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK) { call.resolve(JSObject().put("schemaVersion", 1).put("imported", 0).put("cancelled", true)); return }
        val intent = result.data
        val uris = buildList {
            intent?.data?.let(::add)
            intent?.clipData?.let { clip -> for (i in 0 until clip.itemCount) add(clip.getItemAt(i).uri) }
        }.distinct()
        execute(call) {
            val report = withContext(Dispatchers.IO) { SafLibraryManager(context, LibraryRepository(db)).importUris(uris) }
            emit("libraryChanged", JSObject().put("imported", report.imported))
            JSObject().put("schemaVersion", 1).put("imported", report.imported)
                .put("failed", JSObject().apply { report.failed.forEach { (uri, reason) -> put(uri.toString(), reason) } })
        }
    }
    @PluginMethod fun removeLocalTrack(call: PluginCall) = execute(call) {
        val id = PluginPayloads.requiredId(call.data, "trackId")
        withContext(Dispatchers.IO) { SafLibraryManager(context, LibraryRepository(db)).removeTrack(id) }
        emit("libraryChanged", JSObject().put("removedId", id))
        JSObject().put("schemaVersion", 1)
    }
    @PluginMethod fun migrateWebStorage(call: PluginCall) = execute(call) {
        val version = call.getInt("schemaVersion") ?: throw IllegalArgumentException("schemaVersion required")
        val payload = call.getObject("payload") ?: throw IllegalArgumentException("payload required")
        val values = payload.keys().asSequence().associateWith { key -> payload.opt(key) as? String }
        val report = withContext(Dispatchers.IO) { com.trciesielski.shutter.migration.WebStorageMigration(db).migrate(values, version) }
        if (report.completed) {
            emit("playlistChanged", JSObject().put("migrated", true))
            emit("libraryChanged", JSObject().put("migrated", true))
        }
        JSObject().put("schemaVersion", 1).put("completed", report.completed)
            .put("alreadyCompleted", !report.completed).put("diagnostics", JSArray(report.diagnostics))
            .put("importedPlaylists", report.importedPlaylists).put("importedHistory", report.importedHistory)
    }
    @PluginMethod fun getAudioAnalysisCapabilities(call: PluginCall) = call.resolve(JSObject().put("schemaVersion", 1).put("available", false))
}
