package com.trciesielski.shutter.playback

import android.app.PendingIntent
import android.content.Intent
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import androidx.room.Room
import com.trciesielski.shutter.MainActivity
import com.trciesielski.shutter.data.LibraryRepository
import com.trciesielski.shutter.data.PlaylistRepository
import com.trciesielski.shutter.data.ShutterDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext

class ShutterMediaLibraryService : MediaLibraryService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var database: ShutterDatabase
    private lateinit var player: ExoPlayer
    private lateinit var session: MediaLibrarySession
    private lateinit var store: PlaybackStateStore
    private val historyTracker = PlaybackHistoryTracker()
    private var libraryChangeSubscription: AutoCloseable? = null

    override fun onCreate() {
        super.onCreate()
        database = Room.databaseBuilder(applicationContext, ShutterDatabase::class.java, "shutter-library.db").build()
        val tree = BrowseTree(LibraryRepository(database), PlaylistRepository(database))
        player = PlayerFactory.create(this)
        store = PlaybackStateStore(player)
        player.addListener(object : Player.Listener {
            override fun onEvents(player: Player, events: Player.Events) {
                store.changed()
                val snapshot = store.snapshot()
                store.saveQueue(this@ShutterMediaLibraryService, snapshot)
                scope.launch(Dispatchers.IO) { store.savePosition(database, snapshot) }
            }

            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                recordPlayIfNeeded(historyTracker.onMediaItemTransition(mediaItem?.mediaId, player.isPlaying), mediaItem?.mediaId)
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                recordPlayIfNeeded(historyTracker.onIsPlayingChanged(isPlaying, player.currentMediaItem?.mediaId), player.currentMediaItem?.mediaId)
            }
        })
        scope.launch {
            while (isActive) {
                delay(5_000)
                if (player.isPlaying) {
                    val snapshot = store.snapshot()
                    withContext(Dispatchers.IO) { store.savePosition(database, snapshot) }
                }
            }
        }
        val launchIntent = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        session = MediaLibrarySession.Builder(this, player, MediaSessionCallback(tree, scope))
            .setSessionActivity(launchIntent)
            .build()
        libraryChangeSubscription = SharedLibraryChanges.subscribe { parentId ->
            scope.launch(Dispatchers.Main.immediate) {
                if (::session.isInitialized) session.notifyChildrenChanged(parentId, C.LENGTH_UNSET, null)
            }
        }
        setMediaNotificationProvider(NotificationFactory.create(this))
        scope.launch(Dispatchers.IO) {
            val restored = store.restore(this@ShutterMediaLibraryService, database, tree)
            if (restored != null) withContext(Dispatchers.Main) {
                if (player.mediaItemCount == 0) {
                    player.setMediaItems(restored.queue, restored.index, restored.positionMs)
                    player.shuffleModeEnabled = restored.shuffle
                    player.repeatMode = restored.repeat
                    player.prepare()
                }
            }
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession = session

    override fun onDestroy() {
        libraryChangeSubscription?.close()
        libraryChangeSubscription = null
        val snapshot = store.snapshot()
        store.saveQueue(this, snapshot)
        runBlocking(Dispatchers.IO) { store.savePosition(database, snapshot) }
        session.release()
        player.release()
        scope.cancel()
        database.close()
        super.onDestroy()
    }

    private fun recordPlayIfNeeded(shouldRecord: Boolean, mediaId: String?) {
        if (!shouldRecord || mediaId.isNullOrBlank()) return
        scope.launch(Dispatchers.IO) {
            LibraryRepository(database).recordPlay(mediaId, System.currentTimeMillis())
            SharedHistoryChanges.publish()
        }
    }
}
