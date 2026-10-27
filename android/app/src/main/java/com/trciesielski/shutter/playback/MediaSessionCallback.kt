package com.trciesielski.shutter.playback

import android.os.Bundle
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionError
import androidx.media3.session.SessionResult
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.SettableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Library commands resolve trusted IDs; standard transport commands are handled by Media3. */
class MediaSessionCallback(private val tree: BrowseTree, private val scope: CoroutineScope) : MediaLibraryService.MediaLibrarySession.Callback {
    override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult =
        MediaSession.ConnectionResult.AcceptedResultBuilder(session)
            .setAvailableSessionCommands(MediaSession.ConnectionResult.DEFAULT_SESSION_AND_LIBRARY_COMMANDS.buildUpon()
                .add(MediaQueueCommands.SET_QUEUE).add(MediaQueueCommands.PLAY_ITEM).build())
            .build()

    override fun onCustomCommand(
        session: MediaSession,
        controller: MediaSession.ControllerInfo,
        customCommand: SessionCommand,
        args: Bundle
    ): ListenableFuture<SessionResult> {
        if (customCommand != MediaQueueCommands.SET_QUEUE && customCommand != MediaQueueCommands.PLAY_ITEM) {
            return super.onCustomCommand(session, controller, customCommand, args)
        }
        return async {
            try {
                val prepared = if (customCommand == MediaQueueCommands.SET_QUEUE) {
                    val ids = args.getStringArrayList(MediaQueueCommands.IDS)?.toList()
                        ?: throw IllegalArgumentException("trackIds required")
                    MediaQueueCommands.prepareSetQueue(tree, ids, args.getInt(MediaQueueCommands.INDEX, -1))
                } else {
                    MediaQueueCommands.preparePlayItem(tree, args.getString(MediaQueueCommands.TRACK_ID).orEmpty())
                }
                withContext(Dispatchers.Main) {
                    applyQueue(session.player, prepared, customCommand == MediaQueueCommands.PLAY_ITEM)
                    MediaQueueCommands.accepted(prepared)
                }
            } catch (error: IllegalArgumentException) {
                SessionResult(SessionError(SessionError.ERROR_BAD_VALUE, error.message ?: "Invalid queue"))
            } catch (error: Exception) {
                SessionResult(SessionError(SessionError.ERROR_UNKNOWN, error.message ?: "Queue command failed"))
            }
        }
    }

    private fun applyQueue(player: Player, prepared: MediaQueueCommands.Prepared, play: Boolean) {
        val previous = (0 until player.mediaItemCount).map(player::getMediaItemAt)
        val previousIndex = player.currentMediaItemIndex
        val previousPosition = player.currentPosition.coerceAtLeast(0)
        val wasPlaying = player.playWhenReady
        try {
            player.setMediaItems(prepared.items, prepared.startIndex, 0)
            player.prepare()
            if (play) player.play()
        } catch (error: Exception) {
            if (previous.isEmpty()) player.clearMediaItems()
            else {
                player.setMediaItems(previous, previousIndex.coerceIn(previous.indices), previousPosition)
                player.prepare()
            }
            player.playWhenReady = wasPlaying
            throw error
        }
    }

    override fun onGetLibraryRoot(
        session: MediaLibraryService.MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        params: MediaLibraryService.LibraryParams?
    ): ListenableFuture<LibraryResult<MediaItem>> = Futures.immediateFuture(LibraryResult.ofItem(tree.root(), params))

    override fun onGetChildren(
        session: MediaLibraryService.MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        parentId: String,
        page: Int,
        pageSize: Int,
        params: MediaLibraryService.LibraryParams?
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = async {
        val items = tree.children(parentId)
        val start = page.toLong() * pageSize
        LibraryResult.ofItemList(if (start >= items.size) emptyList() else items.drop(start.toInt()).take(pageSize), params)
    }

    override fun onGetItem(
        session: MediaLibraryService.MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        mediaId: String
    ): ListenableFuture<LibraryResult<MediaItem>> = async {
        tree.item(mediaId)?.let { LibraryResult.ofItem(it, null) }
            ?: LibraryResult.ofError(SessionError.ERROR_BAD_VALUE)
    }

    override fun onSearch(
        session: MediaLibraryService.MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        query: String,
        params: MediaLibraryService.LibraryParams?
    ): ListenableFuture<LibraryResult<Void>> = async {
        val count = tree.search(query).size
        withContext(Dispatchers.Main) { session.notifySearchResultChanged(browser, query, count, params) }
        LibraryResult.ofVoid(params)
    }

    override fun onGetSearchResult(
        session: MediaLibraryService.MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        query: String,
        page: Int,
        pageSize: Int,
        params: MediaLibraryService.LibraryParams?
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = async {
        val items = tree.search(query)
        val start = page.toLong() * pageSize
        LibraryResult.ofItemList(if (start >= items.size) emptyList() else items.drop(start.toInt()).take(pageSize), params)
    }

    override fun onAddMediaItems(
        mediaSession: MediaSession,
        controller: MediaSession.ControllerInfo,
        mediaItems: List<MediaItem>
    ): ListenableFuture<List<MediaItem>> = async {
        mediaItems.map { request -> resolve(request) ?: throw IllegalArgumentException("Unknown media ID") }
    }

    override fun onSetMediaItems(
        mediaSession: MediaSession,
        controller: MediaSession.ControllerInfo,
        mediaItems: List<MediaItem>,
        startIndex: Int,
        startPositionMs: Long
    ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> = async {
        if (mediaItems.size == 1 && startIndex <= 0) {
            val request = mediaItems.single()
            val selected = if (request.mediaId.isNotBlank()) request.mediaId else tree.search(request.requestMetadata.searchQuery.orEmpty()).firstOrNull()?.mediaId.orEmpty()
            val expanded = tree.queueFor(selected) ?: throw IllegalArgumentException("Unknown media ID")
            val position = if (startPositionMs == C.TIME_UNSET) C.TIME_UNSET else PlaybackStateStore.clampSeek(
                startPositionMs, expanded.first[expanded.second].mediaMetadata.durationMs ?: -1
            )
            MediaSession.MediaItemsWithStartPosition(expanded.first, expanded.second, position)
        } else {
            val resolved = mediaItems.map { request -> resolve(request) ?: throw IllegalArgumentException("Unknown media ID") }
            val position = if (startPositionMs == C.TIME_UNSET || startIndex !in resolved.indices) startPositionMs else
                PlaybackStateStore.clampSeek(startPositionMs, resolved[startIndex].mediaMetadata.durationMs ?: -1)
            MediaSession.MediaItemsWithStartPosition(resolved, startIndex, position)
        }
    }

    private suspend fun resolve(request: MediaItem): MediaItem? {
        val id = request.mediaId.takeIf(String::isNotBlank)
            ?: tree.search(request.requestMetadata.searchQuery.orEmpty()).firstOrNull()?.mediaId
        return id?.let { tree.item(it) }?.takeIf { it.mediaMetadata.isPlayable == true }
    }

    private fun <T> async(block: suspend () -> T): ListenableFuture<T> {
        val future = SettableFuture.create<T>()
        scope.launch(Dispatchers.IO) {
            try { future.set(block()) } catch (error: Exception) { future.setException(error) }
        }
        return future
    }
}
