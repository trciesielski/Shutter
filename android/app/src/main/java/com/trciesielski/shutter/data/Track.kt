package com.trciesielski.shutter.data

import android.net.Uri

data class Track(
    val id: String,
    val title: String,
    val artist: String,
    val album: String,
    val uri: Uri,
    val source: TrackSource,
    val mimeType: String?,
    val durationMs: Long?,
    val artworkUri: Uri?,
    val order: Int?
)
