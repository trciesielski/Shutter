package com.trciesielski.shutter.playback

/** Converts Media3 transitions into one play event per current-item transition. */
class PlaybackHistoryTracker {
    private var pending = false
    private var lastStartedId: String? = null

    fun onMediaItemTransition(mediaId: String?, isPlaying: Boolean): Boolean {
        if (mediaId.isNullOrBlank()) return false
        pending = true
        return if (isPlaying) consume(mediaId) else false
    }

    fun onIsPlayingChanged(isPlaying: Boolean, mediaId: String?): Boolean {
        if (!isPlaying || mediaId.isNullOrBlank()) return false
        if (!pending && mediaId != lastStartedId) pending = true
        return if (pending) consume(mediaId) else false
    }

    private fun consume(mediaId: String): Boolean {
        pending = false
        lastStartedId = mediaId
        return true
    }
}
