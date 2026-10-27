package com.trciesielski.shutter.playback

import org.junit.Assert.*
import org.junit.Test

class PlaybackHistoryTrackerTest {
    @Test fun recordsOnceForEachCurrentTrackTransition() {
        val tracker = PlaybackHistoryTracker()

        assertFalse(tracker.onMediaItemTransition("a", isPlaying = false))
        assertTrue(tracker.onIsPlayingChanged(true, "a"))
        assertFalse(tracker.onIsPlayingChanged(true, "a"))
        assertFalse(tracker.onIsPlayingChanged(true, "a"))

        assertTrue(tracker.onMediaItemTransition("b", isPlaying = true))
        assertFalse(tracker.onIsPlayingChanged(true, "b"))
        assertTrue(tracker.onMediaItemTransition("b", isPlaying = true))
    }
}
