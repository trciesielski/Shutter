package com.trciesielski.shutter.playback

import java.util.concurrent.CopyOnWriteArraySet

/** Process-local fan-out used by the plugin and the one MediaLibrarySession. */
open class LibraryChangeNotifier {
    private val listeners = CopyOnWriteArraySet<(String) -> Unit>()

    fun subscribe(listener: (String) -> Unit): AutoCloseable {
        listeners += listener
        return AutoCloseable { listeners -= listener }
    }

    fun publish(parentId: String) {
        listeners.forEach { it(parentId) }
    }
}

object SharedLibraryChanges : LibraryChangeNotifier()

object SharedHistoryChanges {
    private val listeners = CopyOnWriteArraySet<() -> Unit>()

    fun subscribe(listener: () -> Unit): AutoCloseable {
        listeners += listener
        return AutoCloseable { listeners -= listener }
    }

    fun publish() {
        listeners.forEach { it() }
    }
}
