package com.trciesielski.shutter.playback

import org.junit.Assert.*
import org.junit.Test

class LibraryChangeNotifierTest {
    @Test fun publishesLocalAndAffectedPlaylistParentsUntilLifecycleClose() {
        val notifier = LibraryChangeNotifier()
        val parents = mutableListOf<String>()
        val subscription = notifier.subscribe { parents += it }

        notifier.publish("local")
        notifier.publish("playlists")
        notifier.publish("playlist:road")
        subscription.close()
        notifier.publish("local")

        assertEquals(listOf("local", "playlists", "playlist:road"), parents)
    }
}
